/**
 * @fileoverview Client Contact Management Service
 * @module servers/customer-services/modules/core-business/client-management/services/client-contact-service
 * @description Comprehensive service for managing client contacts including CRUD, communication tracking, and relationship management
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-contact-service'
});
const validator = require('validator');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { parsePhoneNumber, isValidPhoneNumber } = require('libphonenumber-js');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import business services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');

/**
 * Contact Role Constants
 */
const CONTACT_ROLES = {
    PRIMARY: 'primary',
    DECISION_MAKER: 'decision_maker',
    TECHNICAL: 'technical_contact',
    BILLING: 'billing_contact',
    SUPPORT: 'support_contact',
    EXECUTIVE: 'executive',
    MANAGER: 'manager',
    GENERAL: 'general'
};

/**
 * Contact Status Constants
 */
const CONTACT_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    LEFT_COMPANY: 'left_company',
    DO_NOT_CONTACT: 'do_not_contact'
};

/**
 * Client Contact Management Service
 * @class ClientContactService
 */
class ClientContactService {
    constructor() {
        this._dbService = null;
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            autoGenerateContactId: process.env.AUTO_GENERATE_CONTACT_ID !== 'false',
            maxContactsPerClient: parseInt(process.env.MAX_CONTACTS_PER_CLIENT, 10) || 100,
            requireEmailVerification: process.env.REQUIRE_CONTACT_EMAIL_VERIFICATION === 'true',
            trackContactEngagement: process.env.TRACK_CONTACT_ENGAGEMENT !== 'false'
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

    // ============= CONTACT CREATION & MANAGEMENT =============

    /**
     * Create a new client contact with enterprise-grade validation and context inheritance
     */
    async createContact(contactData, options = {}) {
        const operationId = crypto.randomBytes(8).toString('hex');
        const startTime = Date.now();

        try {
            logger.info('Starting contact creation', {
                operationId,
                clientId: contactData.clientId,
                primaryEmail: contactData.contactDetails?.emails?.find(e => e.isPrimary)?.address,
                userId: options.userId,
                source: options.source || 'manual'
            });

            // PHASE 1: INPUT VALIDATION
            await this._validateContactData(contactData);

            if (!contactData.clientId || !mongoose.Types.ObjectId.isValid(contactData.clientId)) {
                throw AppError.validation('Valid client ID is required', {
                    context: {
                        providedClientId: contactData.clientId,
                        field: 'clientId'
                    }
                });
            }

            // PHASE 2: CLIENT VERIFICATION AND CONTEXT INHERITANCE
            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            const parentClient = await Client.findById(contactData.clientId)
                .select('tenantId organizationId companyName relationship.status')
                .lean();

            if (!parentClient) {
                throw AppError.notFound('Parent client not found', {
                    context: { clientId: contactData.clientId }
                });
            }

            if (parentClient.relationship?.status === 'inactive' ||
                parentClient.relationship?.status === 'churned') {
                throw AppError.validation(
                    'Cannot create contacts for inactive or churned clients',
                    {
                        context: {
                            clientId: contactData.clientId,
                            clientStatus: parentClient.relationship.status
                        }
                    }
                );
            }

            // PHASE 3: ACCESS CONTROL VERIFICATION
            if (options.userClientId) {
                if (parentClient._id.toString() !== options.userClientId.toString()) {
                    throw AppError.forbidden(
                        'You can only create contacts for your own account',
                        {
                            context: {
                                requestedClientId: contactData.clientId,
                                userClientId: options.userClientId
                            }
                        }
                    );
                }
                logger.debug('Self-service access validated', {
                    operationId,
                    userId: options.userId,
                    clientId: options.userClientId
                });
            } else if (options.tenantId && !options.skipTenantCheck) {
                if (!mongoose.Types.ObjectId.isValid(options.tenantId)) {
                    throw AppError.validation('Valid tenant ID required in authentication context', {
                        context: {
                            providedTenantId: options.tenantId,
                            clientTenantId: parentClient.tenantId
                        }
                    });
                }

                if (parentClient.tenantId.toString() !== options.tenantId.toString()) {
                    throw AppError.forbidden('Access denied to this client', {
                        context: {
                            clientTenantId: parentClient.tenantId.toString(),
                            userTenantId: options.tenantId.toString()
                        }
                    });
                }

                logger.debug('Administrative access validated', {
                    operationId,
                    userId: options.userId,
                    tenantId: options.tenantId
                });
            }

            // PHASE 4: BUSINESS RULE VALIDATION
            await this._checkContactLimit(contactData.clientId);
            await this._checkDuplicateContact(contactData);

            // PHASE 5: DATA ENRICHMENT AND PREPARATION
            if (!contactData.contactId && this.config.autoGenerateContactId) {
                contactData.contactId = await this._generateContactId();
            }

            contactData.tenantId = parentClient.tenantId;
            contactData.organizationId = parentClient.organizationId;

            if (!contactData.relationship) {
                contactData.relationship = {};
            }
            contactData.relationship.status = contactData.relationship.status || 'active';

            if (!contactData.engagement) {
                contactData.engagement = {
                    totalInteractions: 0,
                    lastInteraction: null,
                    preferredContactMethod: null,
                    contactFrequency: null
                };
            }

            contactData.metadata = {
                createdBy: options.userId,
                createdAt: new Date(),
                lastModifiedBy: options.userId,
                lastModifiedAt: new Date(),
                source: options.source || 'manual',
                sourceDetails: {
                    operationId,
                    userAgent: options.userAgent,
                    ipAddress: options.ipAddress
                }
            };

            contactData.isActive = true;
            contactData.isDeleted = false;

            // PHASE 6: DATABASE PERSISTENCE
            const ClientContact = dbService.getModel('ClientContact', 'customer');
            const newContact = new ClientContact(contactData);
            await newContact.save();

            const duration = Date.now() - startTime;

            logger.info('Contact created successfully', {
                operationId,
                contactId: newContact.contactId,
                clientId: newContact.clientId,
                tenantId: newContact.tenantId.toString(),
                organizationId: newContact.organizationId?.toString(),
                primaryEmail: newContact.contactDetails?.emails?.find(e => e.isPrimary)?.address,
                userId: options.userId,
                duration: `${duration}ms`
            });

            // PHASE 7: POST-CREATION ACTIVITIES
            setImmediate(async () => {
                try {
                    await this._handlePostContactCreation(newContact, options);
                } catch (postError) {
                    logger.error('Post-creation activities failed (non-critical)', {
                        operationId,
                        contactId: newContact.contactId,
                        error: postError.message,
                        stack: postError.stack
                    });
                }
            });

            return this._sanitizeContactOutput(newContact);

        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error('Contact creation failed', {
                operationId,
                error: error.message,
                errorCode: error.code,
                stack: error.stack,
                clientId: contactData?.clientId,
                userId: options?.userId,
                duration: `${duration}ms`,
                context: error.context || {}
            });

            if (error instanceof AppError) {
                throw error;
            }

            if (error.name === 'ValidationError') {
                throw AppError.validation('Contact validation failed', {
                    errors: Object.keys(error.errors).map(key => ({
                        field: key,
                        message: error.errors[key].message,
                        value: error.errors[key].value
                    }))
                });
            }

            throw AppError.internal('Contact creation failed', {
                originalError: error.message,
                operationId
            });
        }
    }

    /**
     * Get contact by ID with enterprise-grade access control
     */
    async getContactById(contactId, options = {}) {
        try {
            logger.info('Fetching contact by ID', { contactId });

            // Validate contact ID format
            if (!mongoose.Types.ObjectId.isValid(contactId)) {
                throw AppError.validation('Invalid contact ID format', {
                    context: { contactId }
                });
            }

            const dbService = this._getDatabaseService();
            const ClientContact = dbService.getModel('ClientContact', 'customer');

            // Build query with population
            let query = ClientContact.findById(contactId);

            if (options.populate) {
                query = query.populate('clientId', 'companyName clientCode tenantId organizationId');
            } else {
                query = query.populate('clientId', 'tenantId organizationId');
            }

            const contact = await query.lean();

            if (!contact) {
                throw AppError.notFound('Contact not found', {
                    context: { contactId }
                });
            }

            // Check if contact is deleted
            if (contact.isDeleted && !options.includeDeleted) {
                throw AppError.notFound('Contact not found', {
                    context: { contactId }
                });
            }

            // ACCESS CONTROL: Self-service check
            if (options.userClientId) {
                const clientIdString = contact.clientId._id ?
                    contact.clientId._id.toString() :
                    contact.clientId.toString();

                if (clientIdString !== options.userClientId.toString()) {
                    throw AppError.forbidden('You can only access contacts from your own account', {
                        context: {
                            contactClientId: clientIdString,
                            userClientId: options.userClientId
                        }
                    });
                }
            }
            // ACCESS CONTROL: Administrative tenant check
            else if (options.tenantId && !options.skipTenantCheck) {
                if (!mongoose.Types.ObjectId.isValid(options.tenantId)) {
                    throw AppError.validation('Valid tenant ID required in authentication context');
                }

                const contactTenantId = contact.clientId.tenantId ?
                    contact.clientId.tenantId.toString() :
                    contact.tenantId.toString();

                if (contactTenantId !== options.tenantId.toString()) {
                    throw AppError.forbidden('Access denied to this contact', {
                        context: {
                            contactTenantId: contactTenantId,
                            userTenantId: options.tenantId.toString()
                        }
                    });
                }
            }

            logger.info('Contact fetched successfully', {
                contactId: contact._id,
                clientId: contact.clientId._id || contact.clientId
            });

            return this._sanitizeContactOutput(contact);

        } catch (error) {
            logger.error('Failed to fetch contact', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    /**
     * Get all contacts for a client with access control
     */
    async getContactsByClient(clientId, options = {}) {
        try {
            logger.info('Fetching contacts by client', { clientId });

            // Validate client ID format
            if (!mongoose.Types.ObjectId.isValid(clientId)) {
                throw AppError.validation('Invalid client ID format', {
                    context: { clientId }
                });
            }

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');
            const ClientContact = dbService.getModel('ClientContact', 'customer');

            // Verify client exists and get tenant information
            const client = await Client.findById(clientId)
                .select('tenantId organizationId companyName')
                .lean();

            if (!client) {
                throw AppError.notFound('Client not found', {
                    context: { clientId }
                });
            }

            // ACCESS CONTROL: Self-service check
            if (options.userClientId) {
                if (client._id.toString() !== options.userClientId.toString()) {
                    throw AppError.forbidden('You can only access contacts from your own account', {
                        context: {
                            requestedClientId: clientId,
                            userClientId: options.userClientId
                        }
                    });
                }
            }
            // ACCESS CONTROL: Administrative tenant check
            else if (options.tenantId && !options.skipTenantCheck) {
                if (!mongoose.Types.ObjectId.isValid(options.tenantId)) {
                    throw AppError.validation('Valid tenant ID required in authentication context');
                }

                if (client.tenantId.toString() !== options.tenantId.toString()) {
                    throw AppError.forbidden('Access denied to this client', {
                        context: {
                            clientTenantId: client.tenantId.toString(),
                            userTenantId: options.tenantId.toString()
                        }
                    });
                }
            }

            // Build query
            const query = {
                clientId: clientId,
                isDeleted: { $ne: true }
            };

            // Filter by status if provided
            if (options.status) {
                query['relationship.status'] = options.status;
            }

            // Filter by role if provided
            if (options.role) {
                query['relationship.type'] = options.role;
            }

            // Build and execute query
            const sortField = options.sortBy || 'personalInfo.lastName';
            const sortOrder = options.sortOrder === 'desc' ? -1 : 1;

            const contacts = await ClientContact.find(query)
                .sort({ [sortField]: sortOrder })
                .lean();

            logger.info('Contacts fetched successfully', {
                clientId,
                count: contacts.length
            });

            return contacts.map(c => this._sanitizeContactOutput(c));

        } catch (error) {
            logger.error('Failed to fetch contacts by client', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Get all contacts for authenticated client with filtering and sorting
     * This method is designed for self-service access where clients retrieve their own contacts
     * @param {Object} options - Query options
     * @param {string} options.userClientId - Client ID from authenticated user (required for self-service)
     * @param {string} options.tenantId - Tenant ID for admin access
     * @param {string} options.status - Filter by status (active, inactive, etc.)
     * @param {string} options.role - Filter by role (primary, decision_maker, etc.)
     * @param {string} options.search - Search term for name or email
     * @param {string} options.sortBy - Field to sort by (default: 'personalInfo.lastName')
     * @param {string} options.sortOrder - Sort order: 'asc' or 'desc' (default: 'asc')
     * @param {number} options.limit - Maximum number of contacts to return
     * @param {number} options.skip - Number of contacts to skip for pagination
     * @param {boolean} options.includeDeleted - Include soft-deleted contacts
     * @returns {Promise<Object>} Object containing contacts array and metadata
     */
    async getContacts(options = {}) {
        const operationId = crypto.randomBytes(8).toString('hex');
        const startTime = Date.now();

        try {
            logger.info('Starting get all contacts operation', {
                operationId,
                userClientId: options.userClientId,
                tenantId: options.tenantId,
                filters: {
                    status: options.status,
                    role: options.role,
                    search: options.search
                }
            });

            // PHASE 1: ACCESS CONTROL
            let clientId;

            if (options.userClientId) {
                // Self-service access - client accessing their own contacts
                if (!mongoose.Types.ObjectId.isValid(options.userClientId)) {
                    throw AppError.validation('Invalid client ID', {
                        context: { userClientId: options.userClientId }
                    });
                }
                clientId = options.userClientId;

                logger.debug('Self-service access - retrieving own contacts', {
                    operationId,
                    clientId: clientId
                });
            } else if (options.tenantId) {
                // Administrative access - would need clientId specified
                throw AppError.validation('Client ID required for administrative access', {
                    context: {
                        message: 'Use getContactsByClient method for admin operations with specific clientId'
                    }
                });
            } else {
                throw AppError.unauthorized('Authentication required', {
                    context: { message: 'User must be authenticated to retrieve contacts' }
                });
            }

            // PHASE 2: BUILD QUERY
            const dbService = this._getDatabaseService();
            const ClientContact = dbService.getModel('ClientContact', 'customer');

            const query = {
                clientId: clientId,
                isDeleted: options.includeDeleted === true ? { $in: [true, false] } : { $ne: true }
            };

            // Apply status filter
            if (options.status) {
                if (!Object.values(CONTACT_STATUS).includes(options.status)) {
                    throw AppError.validation('Invalid status filter', {
                        context: {
                            provided: options.status,
                            validValues: Object.values(CONTACT_STATUS)
                        }
                    });
                }
                query['relationship.status'] = options.status;
            } else {
                // Default to active contacts only
                query['relationship.status'] = CONTACT_STATUS.ACTIVE;
            }

            // Apply role filter
            if (options.role) {
                if (!Object.values(CONTACT_ROLES).includes(options.role)) {
                    throw AppError.validation('Invalid role filter', {
                        context: {
                            provided: options.role,
                            validValues: Object.values(CONTACT_ROLES)
                        }
                    });
                }
                query['professionalInfo.role'] = options.role;
            }

            // Apply search filter
            if (options.search && options.search.trim()) {
                const searchTerm = options.search.trim();
                query.$or = [
                    { 'personalInfo.firstName': { $regex: searchTerm, $options: 'i' } },
                    { 'personalInfo.lastName': { $regex: searchTerm, $options: 'i' } },
                    { 'contactDetails.emails.address': { $regex: searchTerm, $options: 'i' } },
                    { 'professionalInfo.jobTitle': { $regex: searchTerm, $options: 'i' } }
                ];
            }

            // PHASE 3: BUILD SORT OPTIONS
            const sortBy = options.sortBy || 'personalInfo.lastName';
            const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
            const sort = { [sortBy]: sortOrder };

            // Add secondary sort by firstName for consistent ordering
            if (sortBy !== 'personalInfo.firstName') {
                sort['personalInfo.firstName'] = 1;
            }

            // PHASE 4: PAGINATION
            const limit = options.limit ? parseInt(options.limit, 10) : 50;
            const skip = options.skip ? parseInt(options.skip, 10) : 0;

            if (limit > 100) {
                throw AppError.validation('Limit cannot exceed 100 contacts per request', {
                    context: { requestedLimit: limit, maxLimit: 100 }
                });
            }

            // PHASE 5: EXECUTE QUERY
            const [contacts, totalCount] = await Promise.all([
                ClientContact.find(query)
                    .select('-__v -security.accessCredentials')
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                ClientContact.countDocuments(query)
            ]);

            // PHASE 6: SANITIZE OUTPUT
            const sanitizedContacts = contacts.map(contact => this._sanitizeContactOutput(contact));

            const duration = Date.now() - startTime;

            logger.info('Get all contacts completed successfully', {
                operationId,
                clientId: clientId,
                count: contacts.length,
                totalCount: totalCount,
                duration: `${duration}ms`,
                filters: {
                    status: options.status,
                    role: options.role,
                    hasSearch: !!options.search
                }
            });

            return {
                contacts: sanitizedContacts,
                metadata: {
                    total: totalCount,
                    count: contacts.length,
                    limit: limit,
                    skip: skip,
                    hasMore: skip + contacts.length < totalCount,
                    filters: {
                        status: options.status || CONTACT_STATUS.ACTIVE,
                        role: options.role,
                        search: options.search
                    }
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error('Get all contacts failed', {
                operationId,
                error: error.message,
                duration: `${duration}ms`,
                userClientId: options.userClientId
            });

            throw error;
        }
    }

    /**
     * Update contact information with access control
     */
    async updateContact(contactId, updateData, options = {}) {
        try {
            logger.info('Updating contact', {
                contactId,
                updateFields: Object.keys(updateData),
                userId: options.userId
            });

            // Validate contact ID format
            if (!mongoose.Types.ObjectId.isValid(contactId)) {
                throw AppError.validation('Invalid contact ID format', {
                    context: { contactId }
                });
            }

            // Validate update data
            await this._validateContactUpdateData(updateData);

            // Get existing contact with access control
            const existingContact = await this.getContactById(contactId, {
                tenantId: options.tenantId,
                userClientId: options.userClientId,
                skipTenantCheck: options.skipTenantCheck
            });

            const dbService = this._getDatabaseService();
            const ClientContact = dbService.getModel('ClientContact', 'customer');

            // Prepare update with audit information
            const update = {
                ...updateData,
                'metadata.lastModifiedBy': options.userId,
                'metadata.lastModifiedAt': new Date()
            };

            // Perform update
            const updatedContact = await ClientContact.findByIdAndUpdate(
                contactId,
                { $set: update },
                { new: true, runValidators: true }
            ).lean();

            if (!updatedContact) {
                throw AppError.notFound('Contact not found for update');
            }

            logger.info('Contact updated successfully', {
                contactId,
                userId: options.userId
            });

            // Track update event
            setImmediate(async () => {
                try {
                    await this._trackContactEvent(updatedContact, 'contact_updated', {
                        updatedFields: Object.keys(updateData),
                        userId: options.userId
                    });
                } catch (trackError) {
                    logger.error('Failed to track update event', {
                        error: trackError.message,
                        contactId
                    });
                }
            });

            return this._sanitizeContactOutput(updatedContact);

        } catch (error) {
            logger.error('Contact update failed', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    /**
     * Delete/deactivate contact with access control
     */
    async deleteContact(contactId, options = {}) {
        try {
            logger.info('Deleting contact', {
                contactId,
                softDelete: options.softDelete,
                userId: options.userId
            });

            // Validate contact ID format
            if (!mongoose.Types.ObjectId.isValid(contactId)) {
                throw AppError.validation('Invalid contact ID format', {
                    context: { contactId }
                });
            }

            // Get existing contact with access control
            const existingContact = await this.getContactById(contactId, {
                tenantId: options.tenantId,
                userClientId: options.userClientId,
                skipTenantCheck: options.skipTenantCheck
            });

            const dbService = this._getDatabaseService();
            const ClientContact = dbService.getModel('ClientContact', 'customer');

            let result;

            if (options.softDelete !== false) {
                // Soft delete - mark as deleted
                result = await ClientContact.findByIdAndUpdate(
                    contactId,
                    {
                        $set: {
                            isDeleted: true,
                            isActive: false,
                            'relationship.status': CONTACT_STATUS.INACTIVE,
                            'metadata.deletedAt': new Date(),
                            'metadata.deletedBy': options.userId
                        }
                    },
                    { new: true }
                ).lean();
            } else {
                // Hard delete - only if authorized
                if (!options.forceDelete) {
                    throw AppError.forbidden('Hard delete requires force flag');
                }
                result = await ClientContact.findByIdAndDelete(contactId).lean();
            }

            logger.info('Contact deleted successfully', {
                contactId,
                softDelete: options.softDelete !== false,
                userId: options.userId
            });

            // Track deletion event
            setImmediate(async () => {
                try {
                    await this._trackContactEvent(existingContact, 'contact_deleted', {
                        softDelete: options.softDelete !== false,
                        userId: options.userId
                    });
                } catch (trackError) {
                    logger.error('Failed to track deletion event', {
                        error: trackError.message,
                        contactId
                    });
                }
            });

            return {
                success: true,
                contactId,
                deletionType: options.softDelete !== false ? 'soft' : 'hard'
            };

        } catch (error) {
            logger.error('Contact deletion failed', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    /**
     * Record contact interaction with access control
     */
    async recordInteraction(contactId, interactionData, options = {}) {
        try {
            logger.info('Recording contact interaction', {
                contactId,
                type: interactionData.type,
                userId: options.userId
            });

            // Validate contact ID format
            if (!mongoose.Types.ObjectId.isValid(contactId)) {
                throw AppError.validation('Invalid contact ID format', {
                    context: { contactId }
                });
            }

            // Get existing contact with access control
            const existingContact = await this.getContactById(contactId, {
                tenantId: options.tenantId,
                userClientId: options.userClientId,
                skipTenantCheck: options.skipTenantCheck
            });

            const dbService = this._getDatabaseService();
            const ClientContact = dbService.getModel('ClientContact', 'customer');

            // Prepare interaction record
            const interaction = {
                interactionId: crypto.randomBytes(8).toString('hex'),
                date: new Date(),
                type: interactionData.type,
                channel: interactionData.channel,
                subject: interactionData.subject,
                summary: interactionData.summary,
                outcome: interactionData.outcome,
                participants: interactionData.participants || [options.userId],
                duration: interactionData.duration,
                sentiment: interactionData.sentiment,
                notes: interactionData.notes
            };

            // Update contact with interaction
            const updatedContact = await ClientContact.findByIdAndUpdate(
                contactId,
                {
                    $push: { 'interactions': interaction },
                    $set: {
                        'relationship.lastInteraction.date': new Date(),
                        'relationship.lastInteraction.type': interactionData.type,
                        'relationship.lastInteraction.by': options.userId,
                        'engagement.lastInteraction': new Date()
                    },
                    $inc: { 'engagement.totalInteractions': 1 }
                },
                { new: true }
            ).lean();

            logger.info('Interaction recorded successfully', {
                contactId,
                interactionId: interaction.interactionId,
                userId: options.userId
            });

            // Track interaction event
            setImmediate(async () => {
                try {
                    await this._trackContactEvent(updatedContact, 'interaction_recorded', {
                        interactionType: interactionData.type,
                        userId: options.userId
                    });
                } catch (trackError) {
                    logger.error('Failed to track interaction event', {
                        error: trackError.message,
                        contactId
                    });
                }
            });

            return this._sanitizeContactOutput(updatedContact);

        } catch (error) {
            logger.error('Failed to record interaction', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    // ============= VALIDATION METHODS =============

    /**
     * Validate contact data with enhanced error reporting
     * @private
     */
    async _validateContactData(contactData) {
        const errors = [];

        logger.debug('Starting contact data validation', {
            hasClientId: !!contactData.clientId,
            hasPersonalInfo: !!contactData.personalInfo,
            hasContactDetails: !!contactData.contactDetails
        });

        // Required fields
        if (!contactData.clientId) {
            errors.push({ field: 'clientId', message: 'Client ID is required' });
        }

        if (!contactData.personalInfo?.firstName) {
            errors.push({ field: 'personalInfo.firstName', message: 'First name is required' });
        }

        if (!contactData.personalInfo?.lastName) {
            errors.push({ field: 'personalInfo.lastName', message: 'Last name is required' });
        }

        // Email validation
        const primaryEmail = contactData.contactDetails?.emails?.find(e => e.isPrimary);
        if (primaryEmail?.address) {
            if (!validator.isEmail(primaryEmail.address)) {
                errors.push({ field: 'contactDetails.emails', message: 'Invalid email address' });
            }
            logger.debug('Email validation passed', { email: primaryEmail.address });
        }

        // Phone validation with libphonenumber-js
        const primaryPhone = contactData.contactDetails?.phones?.find(p => p.isPrimary);
        if (primaryPhone?.number) {
            logger.debug('Validating phone number', {
                phoneNumber: primaryPhone.number,
                phoneType: primaryPhone.type
            });

            try {
                // Check if the phone number is valid
                const isValid = isValidPhoneNumber(primaryPhone.number);

                logger.debug('Phone validation result', {
                    phoneNumber: primaryPhone.number,
                    isValid: isValid
                });

                if (!isValid) {
                    errors.push({
                        field: 'contactDetails.phones',
                        message: `Invalid phone number format: ${primaryPhone.number}`
                    });
                } else {
                    // Parse and normalize the phone number
                    try {
                        const phoneNumber = parsePhoneNumber(primaryPhone.number);
                        primaryPhone.normalized = phoneNumber.format('E.164');
                        primaryPhone.country = phoneNumber.country;

                        logger.debug('Phone number normalized', {
                            original: primaryPhone.number,
                            normalized: primaryPhone.normalized,
                            country: primaryPhone.country
                        });
                    } catch (parseError) {
                        logger.warn('Phone number parse warning', {
                            phoneNumber: primaryPhone.number,
                            error: parseError.message
                        });
                        // Phone is valid but couldn't extract country - continue anyway
                    }
                }
            } catch (validationError) {
                logger.error('Phone validation error', {
                    phoneNumber: primaryPhone.number,
                    error: validationError.message,
                    stack: validationError.stack
                });

                errors.push({
                    field: 'contactDetails.phones',
                    message: `Unable to validate phone number: ${validationError.message}`
                });
            }
        }

        // LinkedIn URL validation
        if (contactData.socialMedia?.linkedin) {
            if (!validator.isURL(contactData.socialMedia.linkedin)) {
                errors.push({ field: 'socialMedia.linkedin', message: 'Invalid LinkedIn URL' });
            }
        }

        if (errors.length > 0) {
            logger.error('Contact validation failed with errors', {
                errors: errors,
                contactData: {
                    clientId: contactData.clientId,
                    firstName: contactData.personalInfo?.firstName,
                    lastName: contactData.personalInfo?.lastName,
                    primaryEmail: primaryEmail?.address,
                    primaryPhone: primaryPhone?.number
                }
            });

            throw AppError.validation('Contact validation failed', { errors });
        }

        logger.debug('Contact validation passed successfully');
    }

    /**
     * Validate contact update data
     * @private
     */
    async _validateContactUpdateData(updateData) {
        const errors = [];

        // Cannot update immutable fields
        const immutableFields = ['contactId', 'clientId', 'tenantId', 'organizationId', 'metadata.createdAt', 'metadata.createdBy'];
        for (const field of immutableFields) {
            if (updateData[field] !== undefined) {
                errors.push({ field, message: `${field} cannot be updated` });
            }
        }

        // Validate email if provided
        if (updateData.contactDetails?.emails) {
            const emails = Array.isArray(updateData.contactDetails.emails) ?
                updateData.contactDetails.emails : [updateData.contactDetails.emails];

            for (const email of emails) {
                if (email.address && !validator.isEmail(email.address)) {
                    errors.push({ field: 'contactDetails.emails', message: 'Invalid email address' });
                }
            }
        }

        if (errors.length > 0) {
            throw AppError.validation('Contact update validation failed', { errors });
        }
    }

    /**
     * Check contact limit for client
     * @private
     */
    async _checkContactLimit(clientId) {
        const dbService = this._getDatabaseService();
        const ClientContact = dbService.getModel('ClientContact', 'customer');

        const count = await ClientContact.countDocuments({
            clientId: clientId,
            isDeleted: { $ne: true }
        });

        if (count >= this.config.maxContactsPerClient) {
            throw AppError.validation('Contact limit reached for this client', {
                context: {
                    currentCount: count,
                    maxAllowed: this.config.maxContactsPerClient
                }
            });
        }
    }

    /**
     * Check for duplicate contact
     * @private
     */
    async _checkDuplicateContact(contactData) {
        const dbService = this._getDatabaseService();
        const ClientContact = dbService.getModel('ClientContact', 'customer');

        const primaryEmail = contactData.contactDetails?.emails?.find(e => e.isPrimary);

        if (primaryEmail?.address) {
            const existing = await ClientContact.findOne({
                clientId: contactData.clientId,
                'contactDetails.emails': {
                    $elemMatch: {
                        address: primaryEmail.address,
                        isPrimary: true
                    }
                },
                isDeleted: { $ne: true }
            });

            if (existing) {
                throw AppError.conflict('Contact with this email already exists for this client', {
                    context: {
                        existingContactId: existing.contactId || existing._id,
                        email: primaryEmail.address
                    }
                });
            }
        }
    }

    // ============= HELPER METHODS =============

    /**
     * Generate unique contact ID
     * @private
     */
    async _generateContactId() {
        const prefix = 'CONT';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();

        const id = `${prefix}-${timestamp}${random}`;

        // Verify uniqueness
        const dbService = this._getDatabaseService();
        const ClientContact = dbService.getModel('ClientContact', 'customer');
        const existing = await ClientContact.findOne({ contactId: id });

        if (existing) {
            return this._generateContactId();
        }

        return id;
    }

    /**
     * Handle post-contact creation activities
     * @private
     */
    async _handlePostContactCreation(contact, options) {
        try {
            // Send welcome notification if applicable
            const primaryEmail = contact.contactDetails?.emails?.find(e => e.isPrimary);
            if (primaryEmail?.address && options.sendWelcome) {
                await this._sendContactWelcomeNotification(contact);
            }

            // Track creation event
            await this._trackContactEvent(contact, 'contact_created', {
                userId: options.userId,
                source: options.source || 'manual'
            });

        } catch (error) {
            logger.error('Post-contact creation activities failed (non-blocking)', {
                error: error.message,
                contactId: contact.contactId
            });
        }
    }

    /**
     * Send contact welcome notification
     * @private
     */
    async _sendContactWelcomeNotification(contact) {
        try {
            const primaryEmail = contact.contactDetails?.emails?.find(e => e.isPrimary);
            if (typeof this.notificationService.sendNotification === 'function' && primaryEmail) {
                await this.notificationService.sendNotification({
                    type: 'contact_welcome',
                    recipient: primaryEmail.address,
                    data: {
                        firstName: contact.personalInfo.firstName,
                        lastName: contact.personalInfo.lastName,
                        contactId: contact.contactId
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to send contact welcome notification', { error: error.message });
        }
    }

    /**
     * Track contact event
     * @private
     */
    async _trackContactEvent(contact, eventType, data) {
        try {
            if (typeof this.analyticsService.trackEvent === 'function') {
                await this.analyticsService.trackEvent({
                    type: eventType,
                    contactId: contact._id || contact.id,
                    clientId: contact.clientId,
                    data: data
                });
            }
        } catch (error) {
            logger.error('Failed to track contact event', { error: error.message });
        }
    }

    /**
     * Sanitize contact output
     * @private
     */
    _sanitizeContactOutput(contact) {
        if (!contact) return null;

        const contactObject = contact.toObject ? contact.toObject() : contact;

        // Remove sensitive fields
        delete contactObject.__v;
        delete contactObject.security?.accessCredentials;

        return contactObject;
    }
}

module.exports = new ClientContactService();