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
            this._dbService = database;
        }
        return this._dbService;
    }

    // ============= CONTACT CREATION & MANAGEMENT =============

    /**
     * Create a new client contact
     * @param {Object} contactData - Contact information
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created contact
     */
    async createContact(contactData, options = {}) {
        try {
            logger.info('Starting contact creation', {
                clientId: contactData.clientId,
                email: contactData.contactInfo?.email
            });

            // Validate contact data
            await this._validateContactData(contactData);

            // Verify client exists
            await this._verifyClientExists(contactData.clientId, options.tenantId);

            // Check contact limit
            await this._checkContactLimit(contactData.clientId);

            // Check for duplicate contact
            await this._checkDuplicateContact(contactData);

            // Generate contact ID if not provided
            if (!contactData.contactId && this.config.autoGenerateContactId) {
                contactData.contactId = await this._generateContactId();
            }

            // Set default values
            contactData.tenantId = options.tenantId || this.config.companyTenantId;
            contactData.organizationId = options.organizationId || contactData.organizationId;
            contactData.status = contactData.status || CONTACT_STATUS.ACTIVE;

            // Initialize engagement tracking
            contactData.engagement = {
                totalInteractions: 0,
                lastInteraction: null,
                preferredContactTime: null,
                responseRate: 0
            };

            // Initialize metadata
            contactData.metadata = {
                createdBy: options.userId,
                createdAt: new Date(),
                source: options.source || 'manual'
            };

            const dbService = this._getDatabaseService();
            const ClientContact = await dbService.getModel('ClientContact', 'customer');

            // Create contact
            const newContact = new ClientContact(contactData);
            await newContact.save();

            logger.info('Contact created successfully', {
                contactId: newContact.contactId,
                clientId: newContact.clientId,
                email: newContact.contactInfo?.email
            });

            // Post-creation activities
            await this._handlePostContactCreation(newContact, options);

            return this._sanitizeContactOutput(newContact);

        } catch (error) {
            logger.error('Contact creation failed', {
                error: error.message,
                stack: error.stack,
                clientId: contactData?.clientId
            });
            throw error;
        }
    }

    /**
     * Get contact by ID
     * @param {string} contactId - Contact ID or MongoDB ObjectId
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Contact data
     */
    async getContactById(contactId, options = {}) {
        try {
            logger.info('Fetching contact by ID', { contactId });

            const dbService = this._getDatabaseService();
            const ClientContact = await dbService.getModel('ClientContact', 'customer');

            // Determine if searching by MongoDB ID or contactId field
            let query;
            if (contactId.match(/^[0-9a-fA-F]{24}$/)) {
                query = ClientContact.findById(contactId);
            } else {
                query = ClientContact.findOne({ contactId: contactId.toUpperCase() });
            }

            // Apply population if requested
            if (options.populate) {
                query = query.populate('clientId assignedTo reportingTo');
            }

            const contact = await query.exec();

            if (!contact) {
                throw AppError.notFound('Contact not found', {
                    context: { contactId }
                });
            }

            // Check tenant access
            if (options.tenantId && contact.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this contact');
            }

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
     * Get all contacts for a client
     * @param {string} clientId - Client ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of contacts
     */
    async getContactsByClient(clientId, options = {}) {
        try {
            logger.info('Fetching contacts by client', { clientId });

            const dbService = this._getDatabaseService();
            const ClientContact = await dbService.getModel('ClientContact', 'customer');

            const query = {
                clientId: clientId,
                tenantId: options.tenantId || this.config.companyTenantId
            };

            // Filter by status if provided
            if (options.status) {
                query.status = options.status;
            }

            // Filter by role if provided
            if (options.role) {
                query['role.primary'] = options.role;
            }

            let contactQuery = ClientContact.find(query);

            // Apply sorting
            const sortField = options.sortBy || 'personalInfo.lastName';
            const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
            contactQuery = contactQuery.sort({ [sortField]: sortOrder });

            const contacts = await contactQuery.lean().exec();

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
     * Update contact information
     * @param {string} contactId - Contact ID
     * @param {Object} updateData - Data to update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated contact
     */
    async updateContact(contactId, updateData, options = {}) {
        try {
            logger.info('Updating contact', {
                contactId,
                updateFields: Object.keys(updateData)
            });

            // Validate update data
            await this._validateContactUpdateData(updateData);

            // Get existing contact
            const contact = await this.getContactById(contactId, { tenantId: options.tenantId });

            const dbService = this._getDatabaseService();
            const ClientContact = await dbService.getModel('ClientContact', 'customer');

            // Prepare update
            const update = {
                ...updateData,
                'metadata.updatedBy': options.userId,
                'metadata.lastModified': new Date()
            };

            // Perform update
            const updatedContact = await ClientContact.findOneAndUpdate(
                { contactId: contactId.toUpperCase() },
                { $set: update },
                { new: true, runValidators: true }
            );

            if (!updatedContact) {
                throw AppError.notFound('Contact not found for update');
            }

            logger.info('Contact updated successfully', {
                contactId,
                email: updatedContact.contactInfo?.email
            });

            // Track update event
            await this._trackContactEvent(updatedContact, 'contact_updated', {
                updatedFields: Object.keys(updateData),
                userId: options.userId
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
     * Delete/deactivate contact
     * @param {string} contactId - Contact ID
     * @param {Object} options - Deletion options
     * @returns {Promise<Object>} Deletion result
     */
    async deleteContact(contactId, options = {}) {
        try {
            logger.info('Deleting contact', { contactId, softDelete: options.softDelete });

            const contact = await this.getContactById(contactId, { tenantId: options.tenantId });

            const dbService = this._getDatabaseService();
            const ClientContact = await dbService.getModel('ClientContact', 'customer');

            let result;

            if (options.softDelete !== false) {
                // Soft delete - mark as inactive
                result = await ClientContact.findOneAndUpdate(
                    { contactId: contactId.toUpperCase() },
                    {
                        $set: {
                            status: CONTACT_STATUS.INACTIVE,
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
                result = await ClientContact.findOneAndDelete({ contactId: contactId.toUpperCase() });
            }

            logger.info('Contact deleted successfully', {
                contactId,
                softDelete: options.softDelete !== false
            });

            // Track deletion event
            await this._trackContactEvent(contact, 'contact_deleted', {
                softDelete: options.softDelete !== false,
                userId: options.userId
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
     * Record contact interaction
     * @param {string} contactId - Contact ID
     * @param {Object} interactionData - Interaction details
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Updated contact
     */
    async recordInteraction(contactId, interactionData, options = {}) {
        try {
            logger.info('Recording contact interaction', {
                contactId,
                type: interactionData.type
            });

            const contact = await this.getContactById(contactId, { tenantId: options.tenantId });

            const dbService = this._getDatabaseService();
            const ClientContact = await dbService.getModel('ClientContact', 'customer');

            // Prepare interaction record
            const interaction = {
                date: new Date(),
                type: interactionData.type,
                channel: interactionData.channel,
                subject: interactionData.subject,
                notes: interactionData.notes,
                outcome: interactionData.outcome,
                recordedBy: options.userId,
                duration: interactionData.duration,
                sentiment: interactionData.sentiment
            };

            // Update contact with interaction
            const updatedContact = await ClientContact.findOneAndUpdate(
                { contactId: contactId.toUpperCase() },
                {
                    $push: { 'communications.interactionHistory': interaction },
                    $set: {
                        'communications.lastContact.date': new Date(),
                        'communications.lastContact.type': interactionData.type,
                        'communications.lastContact.by': options.userId,
                        'engagement.lastInteraction': new Date(),
                        'engagement.totalInteractions': contact.engagement?.totalInteractions + 1 || 1
                    }
                },
                { new: true }
            );

            logger.info('Interaction recorded successfully', { contactId });

            // Track interaction event
            await this._trackContactEvent(updatedContact, 'interaction_recorded', {
                interactionType: interactionData.type,
                userId: options.userId
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
     * Validate contact data
     * @private
     */
    async _validateContactData(contactData) {
        const errors = [];

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
        if (contactData.contactInfo?.email) {
            if (!validator.isEmail(contactData.contactInfo.email)) {
                errors.push({ field: 'contactInfo.email', message: 'Invalid email address' });
            }
        } else if (this.config.requireEmailVerification) {
            errors.push({ field: 'contactInfo.email', message: 'Email is required' });
        }

        // Phone validation
        if (contactData.contactInfo?.phone) {
            if (!validator.isMobilePhone(contactData.contactInfo.phone, 'any', { strictMode: false })) {
                errors.push({ field: 'contactInfo.phone', message: 'Invalid phone number' });
            }
        }

        // LinkedIn URL validation
        if (contactData.socialMedia?.linkedin) {
            if (!validator.isURL(contactData.socialMedia.linkedin)) {
                errors.push({ field: 'socialMedia.linkedin', message: 'Invalid LinkedIn URL' });
            }
        }

        if (errors.length > 0) {
            throw AppError.validation('Contact validation failed', { errors });
        }
    }

    /**
     * Validate contact update data
     * @private
     */
    async _validateContactUpdateData(updateData) {
        const errors = [];

        // Cannot update immutable fields
        const immutableFields = ['contactId', 'clientId', 'tenantId', 'createdAt'];
        for (const field of immutableFields) {
            if (updateData[field] !== undefined) {
                errors.push({ field, message: `${field} cannot be updated` });
            }
        }

        // Validate email if provided
        if (updateData.contactInfo?.email) {
            if (!validator.isEmail(updateData.contactInfo.email)) {
                errors.push({ field: 'contactInfo.email', message: 'Invalid email address' });
            }
        }

        if (errors.length > 0) {
            throw AppError.validation('Contact update validation failed', { errors });
        }
    }

    /**
     * Verify client exists
     * @private
     */
    async _verifyClientExists(clientId, tenantId) {
        const dbService = this._getDatabaseService();
        const Client = await dbService.getModel('Client', 'customer');

        const client = await Client.findById(clientId);

        if (!client) {
            throw AppError.notFound('Client not found', {
                context: { clientId }
            });
        }

        if (tenantId && client.tenantId.toString() !== tenantId) {
            throw AppError.forbidden('Access denied to this client');
        }
    }

    /**
     * Check contact limit for client
     * @private
     */
    async _checkContactLimit(clientId) {
        const dbService = this._getDatabaseService();
        const ClientContact = await dbService.getModel('ClientContact', 'customer');

        const count = await ClientContact.countDocuments({
            clientId: clientId,
            'metadata.isDeleted': { $ne: true }
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
        const ClientContact = await dbService.getModel('ClientContact', 'customer');

        if (contactData.contactInfo?.email) {
            const existing = await ClientContact.findOne({
                clientId: contactData.clientId,
                'contactInfo.email': contactData.contactInfo.email,
                'metadata.isDeleted': { $ne: true }
            });

            if (existing) {
                throw AppError.conflict('Contact with this email already exists for this client', {
                    context: {
                        existingContactId: existing.contactId,
                        email: existing.contactInfo.email
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
        const ClientContact = await dbService.getModel('ClientContact', 'customer');
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
            if (contact.contactInfo?.email && options.sendWelcome) {
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
            if (typeof this.notificationService.sendNotification === 'function') {
                await this.notificationService.sendNotification({
                    type: 'contact_welcome',
                    recipient: contact.contactInfo.email,
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
        delete contactObject.metadata?.deletedAt;
        delete contactObject.metadata?.deletedBy;
        delete contactObject.security?.accessCredentials;

        return contactObject;
    }
}

module.exports = new ClientContactService();