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
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
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

            // Check tenant access - skip for self-service operations
            // Self-service operations verify ownership at the controller level
            if (options.tenantId && !options.skipTenantCheck && client.tenantId.toString() !== options.tenantId) {
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
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Client data
     */
    async getClientByCode(clientCode, options = {}) {
        try {
            logger.info('Fetching client by code', { clientCode });

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            // Build query based on whether tenant checking is needed
            const query = {
                clientCode: clientCode.toUpperCase()
            };

            // Only add tenant filter if not skipping tenant check
            if (!options.skipTenantCheck) {
                query.tenantId = options.tenantId || this.config.companyTenantId;
            }

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
     * Update client
     * @param {string} clientId - Client ID
     * @param {Object} updateData - Data to update
     * @param {Object} options - Update options
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated client
     */
    async updateClient(clientId, updateData, options = {}) {
        try {
            logger.info('Starting client update', {
                clientId,
                updateFields: Object.keys(updateData)
            });

            // Validate update data
            await this._validateClientUpdateData(updateData);

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            // Get existing client
            const client = await Client.findById(clientId);

            if (!client) {
                throw AppError.notFound('Client not found', {
                    context: { clientId }
                });
            }

            // Check tenant access - skip for self-service operations
            if (options.tenantId && !options.skipTenantCheck && client.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this client');
            }

            // Handle tier changes with approval requirement
            if (updateData.relationship?.tier && 
                updateData.relationship.tier !== client.relationship.tier &&
                this.config.requireApprovalForTierChange) {
                await this._requestTierChangeApproval(clientId, updateData.relationship.tier, options);
                delete updateData.relationship.tier; // Remove until approved
            }

            // Apply updates
            Object.keys(updateData).forEach(key => {
                if (typeof updateData[key] === 'object' && !Array.isArray(updateData[key])) {
                    // Merge nested objects
                    client[key] = { ...client[key], ...updateData[key] };
                } else {
                    client[key] = updateData[key];
                }
            });

            client.updatedAt = new Date();

            // Save updated client
            await client.save();

            logger.info('Client updated successfully', {
                clientId,
                userId: options.userId
            });

            // Track update event
            await this._trackClientEvent(client, 'client_updated', {
                userId: options.userId,
                updatedFields: Object.keys(updateData)
            });

            return this._sanitizeClientOutput(client);

        } catch (error) {
            logger.error('Client update failed', {
                error: error.message,
                clientId,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get client statistics
     * @param {Object} filters - Filter criteria
     * @param {Object} options - Query options
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Client statistics
     */
    async getClientStatistics(filters = {}, options = {}) {
        try {
            logger.info('Fetching client statistics', { filters });

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            // Build query
            const query = {};

            // Add client ID filter if provided
            if (filters.clientId) {
                query._id = filters.clientId;
            }

            // Add tenant filter only if not skipping tenant check
            if (options.tenantId && !options.skipTenantCheck) {
                query.tenantId = options.tenantId;
            }

            // Add date filters if provided
            if (filters.dateFrom || filters.dateTo) {
                query.createdAt = {};
                if (filters.dateFrom) {
                    query.createdAt.$gte = new Date(filters.dateFrom);
                }
                if (filters.dateTo) {
                    query.createdAt.$lte = new Date(filters.dateTo);
                }
            }

            // Get client data
            const client = await Client.findOne(query);

            if (!client) {
                throw AppError.notFound('Client not found for statistics', {
                    context: { filters }
                });
            }

            // Compile statistics
            const statistics = {
                overview: {
                    clientId: client._id,
                    clientCode: client.clientCode,
                    companyName: client.companyName,
                    status: client.relationship?.status,
                    tier: client.relationship?.tier
                },
                financial: {
                    totalRevenue: client.analytics?.lifetime?.totalRevenue || 0,
                    outstandingBalance: client.billing?.outstandingBalance || 0,
                    currency: client.billing?.currency || this.config.defaultCurrency
                },
                engagement: {
                    totalProjects: client.analytics?.lifetime?.totalProjects || 0,
                    activeProjects: client.analytics?.current?.activeProjects || 0,
                    totalEngagements: client.analytics?.lifetime?.totalEngagements || 0,
                    portalLogins: client.analytics?.engagement?.portalLogins || 0
                },
                activity: {
                    lastActivityDate: client.analytics?.engagement?.lastActivityDate,
                    totalInteractions: client.analytics?.engagement?.totalInteractions || 0
                },
                health: {
                    healthScore: client.analytics?.health?.score,
                    churnRisk: client.relationship?.churnRisk?.level,
                    satisfaction: client.analytics?.satisfaction?.score
                }
            };

            logger.info('Client statistics retrieved successfully', {
                clientId: client._id
            });

            return statistics;

        } catch (error) {
            logger.error('Failed to fetch client statistics', {
                error: error.message,
                filters,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Search clients
     * @param {Object} searchCriteria - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async searchClients(searchCriteria, options = {}) {
        try {
            logger.info('Searching clients', { searchCriteria });

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            // Build search query
            const query = {
                tenantId: options.tenantId || this.config.companyTenantId
            };

            // Text search
            if (searchCriteria.searchTerm) {
                query.$or = [
                    { companyName: { $regex: searchCriteria.searchTerm, $options: 'i' } },
                    { clientCode: { $regex: searchCriteria.searchTerm, $options: 'i' } },
                    { 'contact.primaryEmail': { $regex: searchCriteria.searchTerm, $options: 'i' } }
                ];
            }

            // Status filter
            if (searchCriteria.status) {
                query['relationship.status'] = searchCriteria.status;
            }

            // Tier filter
            if (searchCriteria.tier) {
                query['relationship.tier'] = searchCriteria.tier;
            }

            // Pagination
            const page = parseInt(searchCriteria.page, 10) || 1;
            const limit = parseInt(searchCriteria.limit, 10) || 20;
            const skip = (page - 1) * limit;

            // Execute query
            const [clients, total] = await Promise.all([
                Client.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .exec(),
                Client.countDocuments(query)
            ]);

            logger.info('Client search completed', {
                total,
                returned: clients.length,
                page
            });

            return {
                clients: clients.map(client => this._sanitizeClientOutput(client)),
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            };

        } catch (error) {
            logger.error('Client search failed', {
                error: error.message,
                searchCriteria,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Delete client (soft delete)
     * @param {string} clientId - Client ID
     * @param {Object} options - Delete options
     * @returns {Promise<Object>} Deleted client
     */
    async deleteClient(clientId, options = {}) {
        try {
            logger.info('Starting client deletion', { clientId });

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

            // Soft delete
            client.isDeleted = true;
            client.deletedAt = new Date();
            client.deletedBy = options.userId;
            await client.save();

            logger.info('Client deleted successfully', {
                clientId,
                userId: options.userId
            });

            // Track deletion event
            await this._trackClientEvent(client, 'client_deleted', {
                userId: options.userId
            });

            return this._sanitizeClientOutput(client);

        } catch (error) {
            logger.error('Client deletion failed', {
                error: error.message,
                clientId,
                stack: error.stack
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