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
            // CORRECTED: Get the actual DatabaseService instance, not the module
            this._dbService = database.getDatabaseService();
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
            const Client = dbService.getModel('Client', 'customer');

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
            const Client = dbService.getModel('Client', 'customer');

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
            const Client = dbService.getModel('Client', 'customer');

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
     * List clients with filters and pagination
     * @param {Object} filters - Filter criteria
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated client list
     */
    async listClients(filters = {}, options = {}) {
        try {
            logger.info('Listing clients', { filters, options });

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            // Build query
            const query = this._buildClientQuery(filters);

            // Pagination
            const page = parseInt(options.page, 10) || 1;
            const limit = parseInt(options.limit, 10) || 20;
            const skip = (page - 1) * limit;

            // Sort
            const sort = options.sort || { createdAt: -1 };

            // Execute query with pagination
            const [clients, total] = await Promise.all([
                Client.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .populate(options.populate || '')
                    .lean(),
                Client.countDocuments(query)
            ]);

            return {
                data: clients.map(client => this._sanitizeClientOutput(client)),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1
                }
            };

        } catch (error) {
            logger.error('Failed to list clients', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    /**
     * Update client
     * @param {string} clientId - Client ID
     * @param {Object} updateData - Update data
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated client
     */
    async updateClient(clientId, updateData, options = {}) {
        try {
            logger.info('Updating client', { clientId });

            // Validate update data
            await this._validateClientUpdateData(updateData);

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            // Find client
            const client = await Client.findById(clientId);

            if (!client) {
                throw AppError.notFound('Client not found', {
                    context: { clientId }
                });
            }

            // Check tenant access
            if (options.tenantId && client.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this client');
            }

            // Apply updates
            Object.keys(updateData).forEach(key => {
                if (updateData[key] !== undefined) {
                    client[key] = updateData[key];
                }
            });

            // Update metadata
            client.metadata = client.metadata || {};
            client.metadata.lastModifiedAt = new Date();
            client.metadata.lastModifiedBy = options.userId;

            await client.save();

            logger.info('Client updated successfully', {
                clientId: client._id,
                updatedFields: Object.keys(updateData)
            });

            // Track update event
            await this._trackClientEvent(client, 'client_updated', {
                userId: options.userId,
                fields: Object.keys(updateData)
            });

            return this._sanitizeClientOutput(client);

        } catch (error) {
            logger.error('Client update failed', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Delete client (soft delete)
     * @param {string} clientId - Client ID
     * @param {Object} options - Delete options
     * @returns {Promise<Object>} Deletion result
     */
    async deleteClient(clientId, options = {}) {
        try {
            logger.info('Deleting client', { clientId });

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            const client = await Client.findById(clientId);

            if (!client) {
                throw AppError.notFound('Client not found', {
                    context: { clientId }
                });
            }

            // Check tenant access
            if (options.tenantId && client.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this client');
            }

            // Perform soft delete
            client.metadata = client.metadata || {};
            client.metadata.deletedAt = new Date();
            client.metadata.deletedBy = options.userId;
            client.metadata.isDeleted = true;

            await client.save();

            logger.info('Client deleted successfully', {
                clientId: client._id
            });

            // Track deletion event
            await this._trackClientEvent(client, 'client_deleted', {
                userId: options.userId
            });

            return {
                success: true,
                clientId: client._id,
                deletedAt: client.metadata.deletedAt
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
     * Search clients with advanced search capabilities
     * @param {Object} searchParams - Search parameters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Search results
     */
    async searchClients(searchParams = {}, options = {}) {
        try {
            logger.info('Searching clients', { searchParams });

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            // Build search query
            const query = this._buildSearchQuery(searchParams);

            // Pagination
            const page = parseInt(options.page, 10) || 1;
            const limit = parseInt(options.limit, 10) || 20;
            const skip = (page - 1) * limit;

            // Sort
            const sort = options.sort || { relevance: -1, createdAt: -1 };

            // Execute search
            const [clients, total] = await Promise.all([
                Client.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .populate(options.populate || '')
                    .lean(),
                Client.countDocuments(query)
            ]);

            logger.info('Client search completed', {
                resultsFound: total,
                page,
                limit
            });

            return {
                data: clients.map(client => this._sanitizeClientOutput(client)),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1
                },
                searchParams
            };

        } catch (error) {
            logger.error('Client search failed', {
                error: error.message,
                searchParams
            });
            throw error;
        }
    }

    /**
     * Get client statistics
     * @param {Object} filters - Filter criteria
     * @returns {Promise<Object>} Client statistics
     */
    async getClientStatistics(filters = {}) {
        try {
            logger.info('Fetching client statistics');

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            const query = this._buildClientQuery(filters);

            const stats = await Client.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        activeClients: {
                            $sum: { $cond: [{ $eq: ['$relationship.status', 'active'] }, 1, 0] }
                        },
                        prospects: {
                            $sum: { $cond: [{ $eq: ['$relationship.status', 'prospect'] }, 1, 0] }
                        },
                        leads: {
                            $sum: { $cond: [{ $eq: ['$relationship.status', 'lead'] }, 1, 0] }
                        },
                        inactive: {
                            $sum: { $cond: [{ $eq: ['$relationship.status', 'inactive'] }, 1, 0] }
                        },
                        totalRevenue: { $sum: '$analytics.lifetime.totalRevenue' },
                        totalProjects: { $sum: '$analytics.lifetime.totalProjects' }
                    }
                }
            ]);

            const result = stats[0] || {
                total: 0,
                activeClients: 0,
                prospects: 0,
                leads: 0,
                inactive: 0,
                totalRevenue: 0,
                totalProjects: 0
            };

            logger.info('Client statistics fetched successfully', { stats: result });

            return result;

        } catch (error) {
            logger.error('Failed to fetch client statistics', {
                error: error.message
            });
            throw error;
        }
    }

    // ============= HELPER & VALIDATION METHODS =============

    /**
     * Build client query from filters
     * @private
     */
    _buildClientQuery(filters) {
        const query = {};

        // Tenant filter (always required)
        if (filters.tenantId) {
            query.tenantId = filters.tenantId;
        }

        // Organization filter
        if (filters.organizationId) {
            query.organizationId = filters.organizationId;
        }

        // Status filter
        if (filters.status) {
            query['relationship.status'] = filters.status;
        }

        // Tier filter
        if (filters.tier) {
            query['relationship.tier'] = filters.tier;
        }

        // Search by company name
        if (filters.search) {
            query.companyName = { $regex: filters.search, $options: 'i' };
        }

        // Industry filter
        if (filters.industry) {
            query['businessDetails.industry'] = filters.industry;
        }

        // Date range filters
        if (filters.createdFrom || filters.createdTo) {
            query.createdAt = {};
            if (filters.createdFrom) {
                query.createdAt.$gte = new Date(filters.createdFrom);
            }
            if (filters.createdTo) {
                query.createdAt.$lte = new Date(filters.createdTo);
            }
        }

        // Exclude deleted clients
        query['metadata.isDeleted'] = { $ne: true };

        return query;
    }

    /**
     * Build advanced search query for client search
     * @private
     */
    _buildSearchQuery(searchParams) {
        const query = {};
        const orConditions = [];

        // Tenant filter (always required for security)
        if (searchParams.tenantId) {
            query.tenantId = searchParams.tenantId;
        }

        // Organization filter
        if (searchParams.organizationId) {
            query.organizationId = searchParams.organizationId;
        }

        // Full-text search across multiple fields
        if (searchParams.q || searchParams.query || searchParams.search) {
            const searchTerm = searchParams.q || searchParams.query || searchParams.search;
            const searchRegex = { $regex: searchTerm, $options: 'i' };

            orConditions.push(
                { companyName: searchRegex },
                { clientCode: searchRegex },
                { 'contact.primaryEmail': searchRegex },
                { 'contact.primaryPhone': searchRegex },
                { 'businessDetails.industry': searchRegex },
                { 'contact.address.city': searchRegex },
                { 'contact.address.country': searchRegex }
            );
        }

        // Company name search
        if (searchParams.companyName) {
            query.companyName = { $regex: searchParams.companyName, $options: 'i' };
        }

        // Client code search
        if (searchParams.clientCode) {
            query.clientCode = { $regex: searchParams.clientCode, $options: 'i' };
        }

        // Email search
        if (searchParams.email) {
            query['contact.primaryEmail'] = { $regex: searchParams.email, $options: 'i' };
        }

        // Phone search
        if (searchParams.phone) {
            query['contact.primaryPhone'] = { $regex: searchParams.phone, $options: 'i' };
        }

        // Status filter
        if (searchParams.status) {
            if (Array.isArray(searchParams.status)) {
                query['relationship.status'] = { $in: searchParams.status };
            } else {
                query['relationship.status'] = searchParams.status;
            }
        }

        // Tier filter
        if (searchParams.tier) {
            if (Array.isArray(searchParams.tier)) {
                query['relationship.tier'] = { $in: searchParams.tier };
            } else {
                query['relationship.tier'] = searchParams.tier;
            }
        }

        // Industry filter
        if (searchParams.industry) {
            if (Array.isArray(searchParams.industry)) {
                query['businessDetails.industry'] = { $in: searchParams.industry };
            } else {
                query['businessDetails.industry'] = searchParams.industry;
            }
        }

        // Country filter
        if (searchParams.country) {
            query['contact.address.country'] = searchParams.country;
        }

        // City filter
        if (searchParams.city) {
            query['contact.address.city'] = { $regex: searchParams.city, $options: 'i' };
        }

        // Account manager filter
        if (searchParams.accountManager) {
            query['relationship.accountManager'] = searchParams.accountManager;
        }

        // Date range filters
        if (searchParams.createdFrom || searchParams.createdTo) {
            query.createdAt = {};
            if (searchParams.createdFrom) {
                query.createdAt.$gte = new Date(searchParams.createdFrom);
            }
            if (searchParams.createdTo) {
                query.createdAt.$lte = new Date(searchParams.createdTo);
            }
        }

        // Revenue range filters
        if (searchParams.revenueMin || searchParams.revenueMax) {
            query['analytics.lifetime.totalRevenue'] = {};
            if (searchParams.revenueMin) {
                query['analytics.lifetime.totalRevenue'].$gte = parseFloat(searchParams.revenueMin);
            }
            if (searchParams.revenueMax) {
                query['analytics.lifetime.totalRevenue'].$lte = parseFloat(searchParams.revenueMax);
            }
        }

        // Tags filter
        if (searchParams.tags) {
            const tags = Array.isArray(searchParams.tags) ? searchParams.tags : [searchParams.tags];
            query['metadata.tags'] = { $in: tags };
        }

        // Combine OR conditions if any exist
        if (orConditions.length > 0) {
            query.$or = orConditions;
        }

        // Exclude deleted clients
        query['metadata.isDeleted'] = { $ne: true };

        return query;
    }

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
        const Client = dbService.getModel('Client', 'customer');

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
        const Client = dbService.getModel('Client', 'customer');
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