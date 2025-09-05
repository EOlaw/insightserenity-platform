'use strict';

/**
 * @fileoverview Enterprise client contacts service with comprehensive relationship management and communication
 * @module servers/customer-services/modules/core-business/clients/services/client-contacts-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/sms-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-model
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-contact-model
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-note-model
 */

const mongoose = require('mongoose');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../../shared/lib/services/cache-service');
const EmailService = require('../../../../../../shared/lib/services/email-service');
const NotificationService = require('../../../../../../shared/lib/services/notification-service');
const SMSService = require('../../../../../../shared/lib/services/sms-service');
const AuditService = require('../../../../../../shared/lib/security/audit/audit-service');
const ClientModel = require('../models/client-model');
const ClientContactModel = require('../models/client-contact-model');
const ClientNoteModel = require('../models/client-note-model');
const ExcelJS = require('exceljs');
const csv = require('csv-parse/sync');
const moment = require('moment');
const crypto = require('crypto');
const _ = require('lodash');

/**
 * Client contacts service for comprehensive contact relationship management
 * @class ClientContactsService
 * @description Manages contact relationships, hierarchies, communications, and engagement
 */
class ClientContactsService {
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
     * @type {SMSService}
     */
    #smsService;

    /**
     * @private
     * @type {AuditService}
     */
    #auditService;

    /**
     * @private
     * @type {number}
     */
    #defaultCacheTTL = 3600;

    /**
     * @private
     * @type {number}
     */
    #maxBulkOperationSize = 500;

    /**
     * @private
     * @type {Object}
     */
    #communicationDefaults = {
        email: {
            maxRetries: 3,
            retryDelay: 60000,
            trackOpens: true,
            trackClicks: true
        },
        sms: {
            maxLength: 160,
            encoding: 'utf-8',
            priority: 'normal'
        }
    };

    /**
     * @private
     * @type {Object}
     */
    #engagementThresholds = {
        highly_engaged: 80,
        engaged: 60,
        somewhat_engaged: 40,
        minimally_engaged: 20,
        disengaged: 0
    };

    /**
     * @private
     * @type {Map}
     */
    #contactRelationships = new Map();

    /**
     * @private
     * @type {Object}
     */
    #privacySettings = {
        gdprCompliant: true,
        encryptPII: true,
        retentionDays: 2555, // 7 years
        anonymizeOnDelete: true
    };

    /**
     * Creates an instance of ClientContactsService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#smsService = dependencies.smsService || new SMSService();
        this.#auditService = dependencies.auditService || new AuditService();

        this.#initializeService();
    }

    /**
     * Initialize service components
     * @private
     */
    #initializeService() {
        logger.info('Initializing ClientContactsService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            smsEnabled: !!this.#smsService,
            privacySettings: this.#privacySettings
        });
    }

    // ==================== CRUD Operations ====================

    /**
     * Create a new contact for a client
     * @param {string} clientId - Client ID
     * @param {Object} contactData - Contact data
     * @param {string} userId - User creating the contact
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Created contact
     * @throws {ValidationError} If validation fails
     * @throws {ConflictError} If duplicate contact exists
     */
    async createContact(clientId, contactData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Validate client exists
            const client = await ClientModel.findById(clientId);
            if (!client) {
                throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
            }

            // Validate contact data
            await this.#validateContactData(contactData);

            // Check for duplicates
            await this.#checkDuplicateContact(clientId, contactData);

            // Enrich contact data
            const enrichedData = await this.#enrichContactData(contactData, client, userId);

            // Generate contact ID
            if (!enrichedData.contactId) {
                enrichedData.contactId = await ClientContactModel.generateContactId(client.tenantId);
            }

            // Set client and tenant IDs
            enrichedData.clientId = clientId;
            enrichedData.tenantId = client.tenantId;
            enrichedData.organizationId = client.organizationId;

            // Set initial relationship
            enrichedData.relationship = {
                ...enrichedData.relationship,
                status: 'active',
                startDate: new Date(),
                relationshipOwner: userId
            };

            // Create contact
            const contact = await ClientContactModel.create([enrichedData], { session });

            // Handle primary contact designation
            if (enrichedData.roleInfluence?.isPrimaryContact) {
                await this.#updatePrimaryContact(clientId, contact[0]._id, session);
            }

            // Send welcome communication if requested
            if (options.sendWelcome && contact[0].contactDetails.emails?.[0]) {
                await this.#sendWelcomeEmail(contact[0], client);
            }

            // Create initial interaction note
            await this.#createInitialNote(contact[0], userId);

            // Update client analytics
            await this.#updateClientContactMetrics(clientId);

            // Log audit trail
            await this.#auditService.log({
                action: 'CONTACT_CREATED',
                entityType: 'client_contact',
                entityId: contact[0]._id,
                userId,
                details: {
                    contactId: contact[0].contactId,
                    clientId,
                    name: contact[0].fullName
                }
            });

            // Clear caches
            await this.#clearContactCaches(client.tenantId, clientId);

            logger.info('Contact created successfully', {
                contactId: contact[0]._id,
                clientId,
                createdBy: userId
            });

            return contact[0];
        } catch (error) {
            logger.error('Error creating contact', {
                error: error.message,
                clientId,
                userId
            });
            throw error;
        }
    }

    /**
     * Get contact by ID with enrichment
     * @param {string} contactId - Contact ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Contact object
     * @throws {NotFoundError} If contact not found
     */
    async getContactById(contactId, options = {}) {
        const {
            populate = [],
            includeDeleted = false,
            checkPermissions = true,
            userId,
            tenantId
        } = options;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('contact', contactId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) return cached;

            // Build query
            const query = { _id: contactId };
            if (!includeDeleted) query.isDeleted = false;
            if (tenantId) query.tenantId = tenantId;

            // Execute query
            let contactQuery = ClientContactModel.findOne(query);

            // Apply population
            if (populate.includes('client')) {
                contactQuery = contactQuery.populate('clientId', 'companyName clientCode');
            }
            if (populate.includes('relationshipOwner')) {
                contactQuery = contactQuery.populate('relationship.relationshipOwner', 'profile.firstName profile.lastName email');
            }

            const contact = await contactQuery.exec();

            if (!contact) {
                throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
            }

            // Check permissions
            if (checkPermissions && userId) {
                await this.#checkContactAccess(contact, userId, 'read');
            }

            // Enrich contact with additional data
            const enrichedContact = await this.#enrichContactWithMetrics(contact.toObject());

            // Cache result
            await this.#cacheService.set(cacheKey, enrichedContact, this.#defaultCacheTTL);

            return enrichedContact;
        } catch (error) {
            logger.error('Error fetching contact', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    /**
     * Update contact information
     * @param {string} contactId - Contact ID
     * @param {Object} updateData - Update data
     * @param {string} userId - User performing update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated contact
     */
    async updateContact(contactId, updateData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Get existing contact
            const existingContact = await this.getContactById(contactId, {
                checkPermissions: true,
                userId
            });

            if (!existingContact) {
                throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkContactAccess(existingContact, userId, 'write');

            // Validate update data
            await this.#validateUpdateData(updateData, existingContact);

            // Track changes for audit
            const changes = await this.#trackChanges(existingContact, updateData);

            // Apply privacy rules
            const processedData = await this.#applyPrivacyRules(updateData);

            // Handle special updates
            if (updateData.relationship?.status === 'left_company') {
                await this.#handleContactDeparture(contactId, updateData, userId, session);
            }

            // Update contact
            const updatedContact = await ClientContactModel.findByIdAndUpdate(
                contactId,
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

            // Update engagement score
            await updatedContact.calculateEngagementScore();

            // Handle communication preference changes
            if (updateData.communicationPreferences) {
                await this.#updateCommunicationPreferences(updatedContact, changes);
            }

            // Send notifications for significant changes
            await this.#sendUpdateNotifications(updatedContact, changes, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'CONTACT_UPDATED',
                entityType: 'client_contact',
                entityId: contactId,
                userId,
                details: {
                    changes,
                    fieldsUpdated: Object.keys(changes)
                }
            });

            // Clear caches
            await this.#clearContactCaches(updatedContact.tenantId, updatedContact.clientId);

            logger.info('Contact updated successfully', {
                contactId,
                updatedBy: userId,
                fieldsUpdated: Object.keys(changes)
            });

            return updatedContact;
        } catch (error) {
            logger.error('Error updating contact', {
                error: error.message,
                contactId,
                userId
            });
            throw error;
        }
    }

    /**
     * Delete contact (soft or hard delete)
     * @param {string} contactId - Contact ID
     * @param {string} userId - User performing deletion
     * @param {Object} options - Deletion options
     * @returns {Promise<boolean>} Success status
     */
    async deleteContact(contactId, userId, options = {}) {
        const { hardDelete = false, reason, anonymize = true, session = null } = options;

        try {
            const contact = await this.getContactById(contactId, {
                includeDeleted: hardDelete,
                checkPermissions: true,
                userId
            });

            if (!contact) {
                throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
            }

            // Check if primary contact
            if (contact.roleInfluence?.isPrimaryContact && !options.force) {
                throw new ValidationError(
                    'Cannot delete primary contact without reassignment',
                    'PRIMARY_CONTACT_DELETE'
                );
            }

            // Check permissions
            await this.#checkContactAccess(contact, userId, 'delete');

            if (hardDelete) {
                // Anonymize if required
                if (anonymize && this.#privacySettings.anonymizeOnDelete) {
                    await this.#anonymizeContact(contactId, session);
                }

                // Perform hard delete
                await ClientContactModel.deleteOne({ _id: contactId }, { session });
            } else {
                // Soft delete
                await ClientContactModel.findByIdAndUpdate(
                    contactId,
                    {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: userId,
                        'relationship.status': 'inactive'
                    },
                    { session }
                );
            }

            // Update client metrics
            await this.#updateClientContactMetrics(contact.clientId);

            // Log audit trail
            await this.#auditService.log({
                action: hardDelete ? 'CONTACT_HARD_DELETED' : 'CONTACT_SOFT_DELETED',
                entityType: 'client_contact',
                entityId: contactId,
                userId,
                details: {
                    contactName: contact.fullName,
                    clientId: contact.clientId,
                    reason
                }
            });

            // Clear caches
            await this.#clearContactCaches(contact.tenantId, contact.clientId);

            logger.info('Contact deleted successfully', {
                contactId,
                deletedBy: userId,
                hardDelete,
                reason
            });

            return true;
        } catch (error) {
            logger.error('Error deleting contact', {
                error: error.message,
                contactId,
                userId
            });
            throw error;
        }
    }

    // ==================== Relationship Management ====================

    /**
     * Get contact hierarchy for a client
     * @param {string} clientId - Client ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Contact hierarchy
     */
    async getContactHierarchy(clientId, options = {}) {
        const { includeInactive = false } = options;

        try {
            // Get all contacts for client
            const query = {
                clientId,
                isDeleted: false
            };

            if (!includeInactive) {
                query['relationship.status'] = 'active';
            }

            const contacts = await ClientContactModel.find(query)
                .select('-auditLog -searchTokens');

            // Build hierarchy
            const hierarchy = {
                executives: [],
                managers: [],
                technical: [],
                operational: [],
                unassigned: []
            };

            // Categorize contacts
            for (const contact of contacts) {
                const seniority = contact.professionalInfo?.seniority;
                const role = contact.roleInfluence?.stakeholderType;

                if (['c_suite', 'evp', 'svp', 'vp'].includes(seniority)) {
                    hierarchy.executives.push(contact);
                } else if (['director', 'manager', 'lead'].includes(seniority)) {
                    hierarchy.managers.push(contact);
                } else if (contact.roleInfluence?.isTechnicalContact) {
                    hierarchy.technical.push(contact);
                } else if (role === 'end_user' || role === 'project_manager') {
                    hierarchy.operational.push(contact);
                } else {
                    hierarchy.unassigned.push(contact);
                }
            }

            // Build reporting relationships
            const relationships = await this.#buildRelationshipMap(contacts);

            return {
                clientId,
                totalContacts: contacts.length,
                hierarchy,
                relationships,
                primaryContact: contacts.find(c => c.roleInfluence?.isPrimaryContact),
                decisionMakers: contacts.filter(c => c.roleInfluence?.isDecisionMaker),
                keyStakeholders: contacts.filter(c =>
                    c.roleInfluence?.influence?.level === 'champion' ||
                    c.roleInfluence?.influence?.level === 'supporter'
                )
            };
        } catch (error) {
            logger.error('Error getting contact hierarchy', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Map contact relationships
     * @param {string} contactId - Contact ID
     * @param {Array} relationships - Relationship mappings
     * @param {string} userId - User performing mapping
     * @returns {Promise<Object>} Updated relationships
     */
    async mapContactRelationships(contactId, relationships, userId) {
        try {
            const contact = await this.getContactById(contactId);

            if (!contact) {
                throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
            }

            // Validate relationships
            for (const rel of relationships) {
                const relatedContact = await ClientContactModel.findById(rel.contactId);
                if (!relatedContact) {
                    throw new ValidationError(
                        `Related contact ${rel.contactId} not found`,
                        'INVALID_RELATIONSHIP'
                    );
                }

                if (relatedContact.clientId.toString() !== contact.clientId.toString()) {
                    throw new ValidationError(
                        'Contacts must belong to the same client',
                        'CROSS_CLIENT_RELATIONSHIP'
                    );
                }
            }

            // Update relationships
            const updatedContact = await ClientContactModel.findByIdAndUpdate(
                contactId,
                {
                    $set: {
                        'relationship.keyRelationships': relationships.map(rel => ({
                            contactId: rel.contactId,
                            relationship: rel.relationship,
                            strength: rel.strength || 'moderate'
                        }))
                    }
                },
                { new: true }
            );

            // Update relationship map
            await this.#updateRelationshipMap(contact.clientId);

            // Log audit trail
            await this.#auditService.log({
                action: 'CONTACT_RELATIONSHIPS_MAPPED',
                entityType: 'client_contact',
                entityId: contactId,
                userId,
                details: {
                    relationshipsCount: relationships.length
                }
            });

            return updatedContact.relationship.keyRelationships;
        } catch (error) {
            logger.error('Error mapping contact relationships', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    // ==================== Communication Management ====================

    /**
     * Send communication to contact
     * @param {string} contactId - Contact ID
     * @param {Object} communication - Communication details
     * @param {string} userId - User sending communication
     * @returns {Promise<Object>} Communication result
     */
    async sendCommunication(contactId, communication, userId) {
        try {
            const contact = await this.getContactById(contactId);

            if (!contact) {
                throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
            }

            // Check communication preferences
            await this.#checkCommunicationPreferences(contact, communication.channel);

            // Validate content
            await this.#validateCommunicationContent(communication);

            let result;
            switch (communication.channel) {
                case 'email':
                    result = await this.#sendEmailCommunication(contact, communication, userId);
                    break;
                case 'sms':
                    result = await this.#sendSMSCommunication(contact, communication, userId);
                    break;
                case 'notification':
                    result = await this.#sendNotificationCommunication(contact, communication, userId);
                    break;
                default:
                    throw new ValidationError(
                        `Unsupported communication channel: ${communication.channel}`,
                        'INVALID_CHANNEL'
                    );
            }

            // Record interaction
            await contact.recordInteraction({
                type: communication.channel,
                channel: communication.channel,
                direction: 'outbound',
                purpose: communication.purpose,
                subject: communication.subject,
                notes: communication.notes,
                sentiment: 'neutral',
                recordedBy: userId
            }, userId);

            // Update engagement metrics
            await this.#updateEngagementMetrics(contactId, 'communication_sent');

            // Log audit trail
            await this.#auditService.log({
                action: 'COMMUNICATION_SENT',
                entityType: 'client_contact',
                entityId: contactId,
                userId,
                details: {
                    channel: communication.channel,
                    subject: communication.subject
                }
            });

            return result;
        } catch (error) {
            logger.error('Error sending communication', {
                error: error.message,
                contactId,
                channel: communication.channel
            });
            throw error;
        }
    }

    /**
     * Record interaction with contact
     * @param {string} contactId - Contact ID
     * @param {Object} interaction - Interaction details
     * @param {string} userId - User recording interaction
     * @returns {Promise<Object>} Recorded interaction
     */
    async recordInteraction(contactId, interaction, userId) {
        try {
            const contact = await ClientContactModel.findById(contactId);

            if (!contact) {
                throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
            }

            // Validate interaction data
            await this.#validateInteractionData(interaction);

            // Record interaction
            const recordedInteraction = await contact.recordInteraction(interaction, userId);

            // Create interaction note
            await ClientNoteModel.create({
                clientId: contact.clientId,
                tenantId: contact.tenantId,
                organizationId: contact.organizationId,
                content: {
                    title: `${interaction.type} with ${contact.fullName}`,
                    body: interaction.notes || `${interaction.type} interaction recorded`,
                    format: 'plain_text'
                },
                classification: {
                    type: interaction.type,
                    category: { primary: 'relationship' },
                    importance: 'medium'
                },
                context: {
                    relatedTo: {
                        contacts: [{
                            contactId: contact._id,
                            contactName: contact.fullName
                        }]
                    },
                    interaction: {
                        type: interaction.type,
                        date: new Date(),
                        duration: interaction.duration,
                        participants: [userId],
                        outcome: interaction.outcome
                    }
                },
                metadata: {
                    createdBy: userId,
                    source: 'manual'
                }
            });

            // Update engagement score
            await contact.calculateEngagementScore();
            await contact.save();

            // Update client activity
            await this.#updateClientActivity(contact.clientId, 'contact_interaction');

            // Send follow-up reminders if needed
            if (interaction.followUpRequired) {
                await this.#scheduleFollowUp(contact, interaction, userId);
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'INTERACTION_RECORDED',
                entityType: 'client_contact',
                entityId: contactId,
                userId,
                details: {
                    interactionType: interaction.type,
                    outcome: interaction.outcome
                }
            });

            return recordedInteraction;
        } catch (error) {
            logger.error('Error recording interaction', {
                error: error.message,
                contactId,
                userId
            });
            throw error;
        }
    }

    /**
     * Update communication preferences
     * @param {string} contactId - Contact ID
     * @param {Object} preferences - Communication preferences
     * @param {string} userId - User updating preferences
     * @returns {Promise<Object>} Updated preferences
     */
    async updateCommunicationPreferences(contactId, preferences, userId) {
        try {
            const contact = await ClientContactModel.findById(contactId);

            if (!contact) {
                throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
            }

            // Validate preferences
            await this.#validateCommunicationPreferences(preferences);

            // Check GDPR compliance
            if (this.#privacySettings.gdprCompliant) {
                await this.#ensureGDPRCompliance(contact, preferences);
            }

            // Update preferences
            const updatedContact = await ClientContactModel.findByIdAndUpdate(
                contactId,
                {
                    $set: {
                        communicationPreferences: {
                            ...contact.communicationPreferences,
                            ...preferences
                        }
                    }
                },
                { new: true }
            );

            // Update subscriptions
            if (preferences.subscriptions) {
                await updatedContact.updateSubscriptions(preferences.subscriptions);
            }

            // Log preference changes
            await this.#logPreferenceChanges(contact, preferences, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'COMMUNICATION_PREFERENCES_UPDATED',
                entityType: 'client_contact',
                entityId: contactId,
                userId,
                details: {
                    preferences: Object.keys(preferences)
                }
            });

            return updatedContact.communicationPreferences;
        } catch (error) {
            logger.error('Error updating communication preferences', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    // ==================== Engagement & Analytics ====================

    /**
     * Calculate engagement score for contact
     * @param {string} contactId - Contact ID
     * @param {Object} options - Calculation options
     * @returns {Promise<Object>} Engagement score details
     */
    async calculateEngagementScore(contactId, options = {}) {
        const { recalculate = false } = options;

        try {
            const contact = await ClientContactModel.findById(contactId);

            if (!contact) {
                throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
            }

            // Check if recalculation needed
            const lastCalculated = contact.scoring?.engagementScore?.lastCalculated;
            const hoursSinceCalculation = lastCalculated ?
                (new Date() - lastCalculated) / (1000 * 60 * 60) : 999;

            if (!recalculate && hoursSinceCalculation < 24) {
                return contact.scoring.engagementScore;
            }

            // Calculate new score
            await contact.calculateEngagementScore();
            await contact.save();

            // Determine engagement level
            const score = contact.scoring.engagementScore.score;
            let level;
            for (const [key, threshold] of Object.entries(this.#engagementThresholds)) {
                if (score >= threshold) {
                    level = key;
                    break;
                }
            }

            // Generate insights
            const insights = await this.#generateEngagementInsights(contact);

            return {
                score: contact.scoring.engagementScore.score,
                level,
                lastCalculated: contact.scoring.engagementScore.lastCalculated,
                factors: contact.scoring.engagementScore.factors,
                insights,
                recommendations: await this.#generateEngagementRecommendations(contact, level)
            };
        } catch (error) {
            logger.error('Error calculating engagement score', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    /**
     * Get contact activity timeline
     * @param {string} contactId - Contact ID
     * @param {Object} options - Timeline options
     * @returns {Promise<Object>} Activity timeline
     */
    async getContactActivityTimeline(contactId, options = {}) {
        const {
            dateRange = { start: moment().subtract(90, 'days').toDate(), end: new Date() },
            types = ['all'],
            limit = 100
        } = options;

        try {
            const contact = await ClientContactModel.findById(contactId);

            if (!contact) {
                throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
            }

            const timeline = [];

            // Get interactions
            if (types.includes('all') || types.includes('interactions')) {
                const interactions = contact.interactions
                    .filter(i => i.date >= dateRange.start && i.date <= dateRange.end)
                    .map(i => ({
                        type: 'interaction',
                        date: i.date,
                        details: i
                    }));
                timeline.push(...interactions);
            }

            // Get notes
            if (types.includes('all') || types.includes('notes')) {
                const notes = await ClientNoteModel.find({
                    'context.relatedTo.contacts.contactId': contactId,
                    createdAt: { $gte: dateRange.start, $lte: dateRange.end }
                })
                    .select('content.title content.summary createdAt metadata.createdBy')
                    .limit(50);

                timeline.push(...notes.map(n => ({
                    type: 'note',
                    date: n.createdAt,
                    details: n
                })));
            }

            // Get email activities
            if (types.includes('all') || types.includes('emails')) {
                const emailActivities = contact.activities.campaignEngagement
                    .filter(e => e.date >= dateRange.start && e.date <= dateRange.end)
                    .map(e => ({
                        type: 'email',
                        date: e.date,
                        details: e
                    }));
                timeline.push(...emailActivities);
            }

            // Sort timeline by date
            timeline.sort((a, b) => b.date - a.date);

            // Apply limit
            const limitedTimeline = timeline.slice(0, limit);

            return {
                contactId,
                dateRange,
                totalActivities: timeline.length,
                timeline: limitedTimeline,
                summary: {
                    interactions: timeline.filter(t => t.type === 'interaction').length,
                    notes: timeline.filter(t => t.type === 'note').length,
                    emails: timeline.filter(t => t.type === 'email').length
                }
            };
        } catch (error) {
            logger.error('Error getting contact activity timeline', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    // ==================== Bulk Operations ====================

    /**
     * Bulk create contacts
     * @param {string} clientId - Client ID
     * @param {Array} contactsData - Array of contact data
     * @param {string} userId - User performing bulk creation
     * @param {Object} options - Bulk operation options
     * @returns {Promise<Object>} Bulk operation results
     */
    async bulkCreateContacts(clientId, contactsData, userId, options = {}) {
        const { validateAll = true, stopOnError = false } = options;
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            const results = {
                successful: [],
                failed: [],
                total: contactsData.length
            };

            // Validate bulk size
            if (contactsData.length > this.#maxBulkOperationSize) {
                throw new ValidationError(
                    `Bulk operation size exceeds maximum of ${this.#maxBulkOperationSize}`,
                    'BULK_SIZE_EXCEEDED'
                );
            }

            // Get client
            const client = await ClientModel.findById(clientId);
            if (!client) {
                throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
            }

            // Process each contact
            for (const [index, contactData] of contactsData.entries()) {
                try {
                    if (validateAll) {
                        await this.#validateContactData(contactData);
                    }

                    const contact = await this.createContact(
                        clientId,
                        contactData,
                        userId,
                        { ...options, session }
                    );

                    results.successful.push({
                        index,
                        contactId: contact._id,
                        contactName: contact.fullName
                    });
                } catch (error) {
                    results.failed.push({
                        index,
                        data: contactData,
                        error: error.message
                    });

                    if (stopOnError) {
                        throw error;
                    }
                }
            }

            await session.commitTransaction();

            // Update client metrics
            await this.#updateClientContactMetrics(clientId);

            // Log audit trail
            await this.#auditService.log({
                action: 'BULK_CONTACTS_CREATED',
                entityType: 'client_contact',
                userId,
                details: {
                    clientId,
                    total: results.total,
                    successful: results.successful.length,
                    failed: results.failed.length
                }
            });

            logger.info('Bulk contact creation completed', {
                clientId,
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length
            });

            return results;
        } catch (error) {
            await session.abortTransaction();
            logger.error('Error in bulk contact creation', {
                error: error.message,
                clientId,
                userId
            });
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Bulk update contacts
     * @param {Array} updates - Array of update objects
     * @param {string} userId - User performing updates
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Bulk update results
     */
    async bulkUpdateContacts(updates, userId, options = {}) {
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
                    const { contactId, data } = update;

                    const updatedContact = await this.updateContact(
                        contactId,
                        data,
                        userId,
                        { ...options, session }
                    );

                    results.successful.push({
                        contactId: updatedContact._id,
                        contactName: updatedContact.fullName
                    });
                } catch (error) {
                    results.failed.push({
                        contactId: update.contactId,
                        error: error.message
                    });
                }
            }

            await session.commitTransaction();

            return results;
        } catch (error) {
            await session.abortTransaction();
            logger.error('Error in bulk contact update', {
                error: error.message,
                userId
            });
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Bulk send communications
     * @param {Array} communications - Array of communication objects
     * @param {string} userId - User sending communications
     * @param {Object} options - Communication options
     * @returns {Promise<Object>} Bulk communication results
     */
    async bulkSendCommunications(communications, userId, options = {}) {
        const {
            batchSize = 50,
            delayBetweenBatches = 1000,
            personalize = true
        } = options;

        const results = {
            successful: [],
            failed: [],
            total: communications.length
        };

        try {
            // Process in batches
            for (let i = 0; i < communications.length; i += batchSize) {
                const batch = communications.slice(i, i + batchSize);

                await Promise.all(batch.map(async (comm) => {
                    try {
                        // Personalize if requested
                        if (personalize) {
                            comm.content = await this.#personalizeCommunication(comm);
                        }

                        const result = await this.sendCommunication(
                            comm.contactId,
                            comm,
                            userId
                        );

                        results.successful.push({
                            contactId: comm.contactId,
                            messageId: result.messageId
                        });
                    } catch (error) {
                        results.failed.push({
                            contactId: comm.contactId,
                            error: error.message
                        });
                    }
                }));

                // Delay between batches
                if (i + batchSize < communications.length) {
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
                }
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'BULK_COMMUNICATIONS_SENT',
                entityType: 'client_contact',
                userId,
                details: {
                    total: results.total,
                    successful: results.successful.length,
                    failed: results.failed.length
                }
            });

            return results;
        } catch (error) {
            logger.error('Error in bulk communication send', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    // ==================== Search & Export ====================

    /**
     * Search contacts with advanced filtering
     * @param {Object} searchCriteria - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async searchContacts(searchCriteria, options = {}) {
        const {
            page = 1,
            limit = 20,
            sort = { 'scoring.engagementScore.score': -1 },
            tenantId
        } = options;

        try {
            const searchResults = await ClientContactModel.searchContacts(
                tenantId,
                searchCriteria.query || '',
                {
                    clientId: searchCriteria.clientId,
                    filters: searchCriteria.filters || {},
                    limit,
                    skip: (page - 1) * limit,
                    sort
                }
            );

            // Enrich results with additional data
            const enrichedContacts = await Promise.all(
                searchResults.contacts.map(contact =>
                    this.#enrichContactWithMetrics(contact.toObject())
                )
            );

            return {
                contacts: enrichedContacts,
                pagination: {
                    total: searchResults.total,
                    page,
                    limit,
                    totalPages: Math.ceil(searchResults.total / limit),
                    hasMore: searchResults.hasMore
                }
            };
        } catch (error) {
            logger.error('Error searching contacts', {
                error: error.message,
                searchCriteria
            });
            throw error;
        }
    }

    /**
     * Export contacts to various formats
     * @param {Object} filters - Export filters
     * @param {string} format - Export format
     * @param {Object} options - Export options
     * @returns {Promise<Buffer>} Exported data
     */
    async exportContacts(filters = {}, format = 'csv', options = {}) {
        const { fields = [], clientId, tenantId } = options;

        try {
            // Build query
            const query = {
                isDeleted: false,
                'relationship.status': 'active'
            };

            if (clientId) query.clientId = clientId;
            if (tenantId) query.tenantId = tenantId;
            Object.assign(query, filters);

            // Get contacts
            const contacts = await ClientContactModel.find(query)
                .populate('clientId', 'companyName clientCode')
                .limit(10000);

            // Select fields to export
            const exportData = contacts.map(contact => {
                if (fields.length > 0) {
                    return this.#selectFields(contact, fields);
                }
                return this.#getExportableContactFields(contact);
            });

            // Generate export
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
                case 'vcard':
                    exportBuffer = await this.#generateVCardExport(exportData);
                    break;
                default:
                    throw new ValidationError(`Unsupported export format: ${format}`, 'INVALID_FORMAT');
            }

            // Log export
            await this.#auditService.log({
                action: 'CONTACTS_EXPORTED',
                entityType: 'client_contact',
                userId: options.userId,
                details: {
                    format,
                    count: exportData.length,
                    filters
                }
            });

            return exportBuffer;
        } catch (error) {
            logger.error('Error exporting contacts', {
                error: error.message,
                format,
                filters
            });
            throw error;
        }
    }

    // ==================== Private Helper Methods ====================

    /**
     * Validate contact data
     * @private
     */
    async #validateContactData(contactData) {
        const errors = [];

        if (!contactData.personalInfo?.firstName) {
            errors.push('First name is required');
        }

        if (!contactData.personalInfo?.lastName) {
            errors.push('Last name is required');
        }

        if (!contactData.professionalInfo?.jobTitle) {
            errors.push('Job title is required');
        }

        // Validate email if provided
        if (contactData.contactDetails?.emails?.length > 0) {
            for (const email of contactData.contactDetails.emails) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email.address)) {
                    errors.push(`Invalid email address: ${email.address}`);
                }
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Check for duplicate contacts
     * @private
     */
    async #checkDuplicateContact(clientId, contactData) {
        const duplicateQuery = {
            clientId,
            isDeleted: false,
            $or: []
        };

        // Check by name
        if (contactData.personalInfo?.firstName && contactData.personalInfo?.lastName) {
            duplicateQuery.$or.push({
                'personalInfo.firstName': contactData.personalInfo.firstName,
                'personalInfo.lastName': contactData.personalInfo.lastName
            });
        }

        // Check by email
        if (contactData.contactDetails?.emails?.length > 0) {
            duplicateQuery.$or.push({
                'contactDetails.emails.address': contactData.contactDetails.emails[0].address
            });
        }

        if (duplicateQuery.$or.length > 0) {
            const duplicate = await ClientContactModel.findOne(duplicateQuery);
            if (duplicate) {
                throw new ConflictError(
                    'Contact with same name or email already exists',
                    'CONTACT_DUPLICATE'
                );
            }
        }
    }

    /**
     * Enrich contact data
     * @private
     */
    async #enrichContactData(contactData, client, userId) {
        const enriched = { ...contactData };

        // Set default communication preferences
        if (!enriched.communicationPreferences) {
            enriched.communicationPreferences = {
                preferredChannel: 'email',
                preferredLanguage: 'en',
                timezone: client.addresses?.headquarters?.timezone || 'UTC'
            };
        }

        // Set default scoring
        enriched.scoring = {
            leadScore: { score: 50 },
            engagementScore: { score: 50 },
            influenceScore: { overall: 50 }
        };

        // Set metadata
        enriched.metadata = {
            source: 'manual',
            importedBy: userId,
            importedAt: new Date()
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
        return `contact:${type}:${identifier}:${optionsHash}`;
    }

    /**
     * Clear contact caches
     * @private
     */
    async #clearContactCaches(tenantId, clientId = null) {
        const patterns = [`contact:*:${tenantId}:*`];
        if (clientId) {
            patterns.push(`contact:*:${clientId}:*`);
        }

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }

    /**
     * Send email communication
     * @private
     */
    async #sendEmailCommunication(contact, communication, userId) {
        const primaryEmail = contact.contactDetails.emails.find(e => e.isPrimary)?.address ||
            contact.contactDetails.emails[0]?.address;

        if (!primaryEmail) {
            throw new ValidationError('Contact has no email address', 'NO_EMAIL');
        }

        const emailData = {
            to: primaryEmail,
            subject: communication.subject,
            body: communication.content,
            from: communication.from || 'noreply@company.com',
            replyTo: communication.replyTo,
            cc: communication.cc,
            bcc: communication.bcc,
            attachments: communication.attachments,
            tracking: {
                opens: this.#communicationDefaults.email.trackOpens,
                clicks: this.#communicationDefaults.email.trackClicks
            }
        };

        const result = await this.#emailService.send(emailData);

        // Update contact activity
        contact.activities.emailOpens = (contact.activities.emailOpens || 0) + 1;
        await contact.save();

        return {
            messageId: result.messageId,
            status: 'sent',
            sentAt: new Date(),
            channel: 'email',
            recipient: primaryEmail
        };
    }

    /**
     * Generate engagement insights
     * @private
     */
    async #generateEngagementInsights(contact) {
        const insights = [];

        // Recent interaction insight
        const daysSinceContact = contact.daysSinceLastContact;
        if (daysSinceContact && daysSinceContact > 30) {
            insights.push({
                type: 'warning',
                message: `No interaction in ${daysSinceContact} days`,
                action: 'Schedule follow-up call or meeting'
            });
        }

        // Email engagement insight
        if (contact.activities.emailOpens > 0) {
            const clickRate = contact.activities.emailClicks / contact.activities.emailOpens;
            if (clickRate < 0.1) {
                insights.push({
                    type: 'info',
                    message: 'Low email engagement rate',
                    action: 'Review email content strategy'
                });
            }
        }

        // Portal activity insight
        if (contact.activities.portalActivity.totalLogins === 0) {
            insights.push({
                type: 'opportunity',
                message: 'Contact has never logged into portal',
                action: 'Send portal onboarding guide'
            });
        }

        return insights;
    }

    /**
     * Generate Excel export
     * @private
     */
    async #generateExcelExport(data) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Contacts');

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
     * Update primary contact designation for client
     * @private
     * @param {string} clientId - Client ID
     * @param {string} contactId - Contact ID to set as primary
     * @param {Object} session - MongoDB session
     */
    async #updatePrimaryContact(clientId, contactId, session) {
        try {
            // Remove primary designation from existing primary contact
            await ClientContactModel.updateMany(
                {
                    clientId,
                    'roleInfluence.isPrimaryContact': true
                },
                {
                    $set: { 'roleInfluence.isPrimaryContact': false }
                },
                { session }
            );

            // Set new primary contact
            await ClientContactModel.findByIdAndUpdate(
                contactId,
                {
                    $set: { 'roleInfluence.isPrimaryContact': true }
                },
                { session }
            );

            // Update client record with primary contact reference
            await ClientModel.findByIdAndUpdate(
                clientId,
                {
                    $set: { 'contacts.primary': contactId }
                },
                { session }
            );

            logger.info('Primary contact updated', { clientId, contactId });
        } catch (error) {
            logger.error('Error updating primary contact', {
                error: error.message,
                clientId,
                contactId
            });
            throw error;
        }
    }

    /**
     * Send welcome email to new contact
     * @private
     * @param {Object} contact - Contact object
     * @param {Object} client - Client object
     */
    async #sendWelcomeEmail(contact, client) {
        try {
            const primaryEmail = contact.contactDetails.emails.find(e => e.isPrimary)?.address ||
                contact.contactDetails.emails[0]?.address;

            if (!primaryEmail) {
                logger.warn('No email address found for welcome email', { contactId: contact._id });
                return;
            }

            const emailData = {
                to: primaryEmail,
                subject: `Welcome to ${client.companyName} - We're Connected!`,
                template: 'contact-welcome',
                data: {
                    firstName: contact.personalInfo.firstName,
                    clientName: client.companyName,
                    contactName: contact.fullName,
                    jobTitle: contact.professionalInfo?.jobTitle,
                    portalUrl: process.env.CLIENT_PORTAL_URL
                }
            };

            await this.#emailService.sendTemplate(emailData.template, emailData);

            logger.info('Welcome email sent', {
                contactId: contact._id,
                email: primaryEmail
            });
        } catch (error) {
            logger.error('Error sending welcome email', {
                error: error.message,
                contactId: contact._id
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Create initial interaction note for new contact
     * @private
     * @param {Object} contact - Contact object
     * @param {string} userId - User ID
     */
    async #createInitialNote(contact, userId) {
        try {
            await ClientNoteModel.create({
                clientId: contact.clientId,
                tenantId: contact.tenantId,
                organizationId: contact.organizationId,
                content: {
                    title: `New Contact Added: ${contact.fullName}`,
                    body: `Contact ${contact.fullName} (${contact.professionalInfo?.jobTitle}) has been added to the system. Initial relationship status: active.`,
                    format: 'plain_text'
                },
                classification: {
                    type: 'contact_management',
                    category: { primary: 'onboarding' },
                    importance: 'medium'
                },
                context: {
                    relatedTo: {
                        contacts: [{
                            contactId: contact._id,
                            contactName: contact.fullName
                        }]
                    }
                },
                metadata: {
                    source: 'system_generated',
                    createdBy: userId
                }
            });

            logger.debug('Initial note created for contact', { contactId: contact._id });
        } catch (error) {
            logger.error('Error creating initial note', {
                error: error.message,
                contactId: contact._id
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Update client contact metrics and analytics
     * @private
     * @param {string} clientId - Client ID
     */
    async #updateClientContactMetrics(clientId) {
        try {
            const contactMetrics = await ClientContactModel.aggregate([
                {
                    $match: {
                        clientId: mongoose.Types.ObjectId(clientId),
                        isDeleted: false
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalContacts: { $sum: 1 },
                        activeContacts: {
                            $sum: { $cond: [{ $eq: ['$relationship.status', 'active'] }, 1, 0] }
                        },
                        primaryContacts: {
                            $sum: { $cond: [{ $eq: ['$roleInfluence.isPrimaryContact', true] }, 1, 0] }
                        },
                        decisionMakers: {
                            $sum: { $cond: [{ $eq: ['$roleInfluence.isDecisionMaker', true] }, 1, 0] }
                        },
                        averageEngagementScore: {
                            $avg: '$scoring.engagementScore.score'
                        },
                        highlyEngagedCount: {
                            $sum: {
                                $cond: [
                                    { $gte: ['$scoring.engagementScore.score', this.#engagementThresholds.highly_engaged] },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ]);

            const metrics = contactMetrics[0] || {
                totalContacts: 0,
                activeContacts: 0,
                primaryContacts: 0,
                decisionMakers: 0,
                averageEngagementScore: 0,
                highlyEngagedCount: 0
            };

            // Update client analytics
            await ClientModel.findByIdAndUpdate(
                clientId,
                {
                    $set: {
                        'analytics.contacts': {
                            total: metrics.totalContacts,
                            active: metrics.activeContacts,
                            primary: metrics.primaryContacts,
                            decisionMakers: metrics.decisionMakers,
                            averageEngagement: metrics.averageEngagementScore,
                            highlyEngaged: metrics.highlyEngagedCount,
                            lastUpdated: new Date()
                        }
                    }
                }
            );

            logger.debug('Client contact metrics updated', { clientId, metrics });
        } catch (error) {
            logger.error('Error updating client contact metrics', {
                error: error.message,
                clientId
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Enrich contact with additional metrics and data
     * @private
     * @param {Object} contact - Contact object
     * @returns {Promise<Object>} Enriched contact
     */
    async #enrichContactWithMetrics(contact) {
        try {
            const enriched = { ...contact };

            // Calculate days since last interaction
            if (enriched.relationship?.lastInteraction?.date) {
                const daysSince = Math.floor(
                    (new Date() - enriched.relationship.lastInteraction.date) / (1000 * 60 * 60 * 24)
                );
                enriched.daysSinceLastContact = daysSince;
            }

            // Add engagement level
            const engagementScore = enriched.scoring?.engagementScore?.score || 0;
            let engagementLevel = 'disengaged';
            for (const [level, threshold] of Object.entries(this.#engagementThresholds)) {
                if (engagementScore >= threshold) {
                    engagementLevel = level;
                    break;
                }
            }
            enriched.engagementLevel = engagementLevel;

            // Calculate interaction frequency
            const interactions = enriched.interactions || [];
            const last30Days = interactions.filter(i =>
                i.date >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            );
            enriched.monthlyInteractionCount = last30Days.length;

            // Add primary email/phone for easy access
            enriched.primaryEmail = enriched.contactDetails?.emails?.find(e => e.isPrimary)?.address ||
                enriched.contactDetails?.emails?.[0]?.address;
            enriched.primaryPhone = enriched.contactDetails?.phones?.find(p => p.isPrimary)?.number ||
                enriched.contactDetails?.phones?.[0]?.number;

            // Calculate influence score
            if (enriched.roleInfluence) {
                let influenceScore = 50;
                if (enriched.roleInfluence.isPrimaryContact) influenceScore += 20;
                if (enriched.roleInfluence.isDecisionMaker) influenceScore += 20;
                if (enriched.roleInfluence.isBudgetAuthority) influenceScore += 15;
                if (enriched.roleInfluence.influence?.level === 'champion') influenceScore += 10;
                enriched.calculatedInfluenceScore = Math.min(100, influenceScore);
            }

            return enriched;
        } catch (error) {
            logger.error('Error enriching contact with metrics', {
                error: error.message,
                contactId: contact._id
            });
            return contact;
        }
    }

    /**
     * Check contact access permissions
     * @private
     * @param {Object} contact - Contact object
     * @param {string} userId - User ID
     * @param {string} action - Action to check ('read', 'write', 'delete')
     */
    async #checkContactAccess(contact, userId, action) {
        try {
            // Basic implementation - in production, integrate with your permission system

            // Check if user is relationship owner
            if (contact.relationship?.relationshipOwner?.toString() === userId) {
                return true;
            }

            // Check if user has client-level access
            const client = await ClientModel.findById(contact.clientId);
            if (client?.relationship?.accountManager?.toString() === userId) {
                return true;
            }

            // For now, allow all actions - replace with actual permission logic
            return true;
        } catch (error) {
            logger.error('Error checking contact access', {
                error: error.message,
                contactId: contact._id,
                userId,
                action
            });
            throw new ForbiddenError('Access denied', 'CONTACT_ACCESS_DENIED');
        }
    }

    /**
     * Validate update data for contacts
     * @private
     * @param {Object} updateData - Data to validate
     * @param {Object} existingContact - Current contact data
     */
    async #validateUpdateData(updateData, existingContact) {
        const errors = [];

        // Validate email format if provided
        if (updateData.contactDetails?.emails) {
            for (const email of updateData.contactDetails.emails) {
                if (email.address) {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(email.address)) {
                        errors.push(`Invalid email address: ${email.address}`);
                    }
                }
            }
        }

        // Validate phone format if provided
        if (updateData.contactDetails?.phones) {
            for (const phone of updateData.contactDetails.phones) {
                if (phone.number && !/^\+?[\d\s\-\(\)]+$/.test(phone.number)) {
                    errors.push(`Invalid phone number: ${phone.number}`);
                }
            }
        }

        // Validate status transitions
        if (updateData.relationship?.status) {
            const validTransitions = this.#getValidStatusTransitions(existingContact.relationship?.status);
            if (!validTransitions.includes(updateData.relationship.status)) {
                errors.push(`Invalid status transition from ${existingContact.relationship?.status} to ${updateData.relationship.status}`);
            }
        }

        // Validate engagement score range
        if (updateData.scoring?.engagementScore?.score !== undefined) {
            const score = updateData.scoring.engagementScore.score;
            if (score < 0 || score > 100) {
                errors.push('Engagement score must be between 0 and 100');
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'UPDATE_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Track changes between old and new contact data
     * @private
     * @param {Object} original - Original contact data
     * @param {Object} updates - Update data
     * @returns {Object} Changes tracked
     */
    async #trackChanges(original, updates) {
        const changes = {};

        // Track specific field changes
        const fieldsToTrack = [
            'personalInfo.firstName',
            'personalInfo.lastName',
            'professionalInfo.jobTitle',
            'professionalInfo.department',
            'relationship.status',
            'roleInfluence.isPrimaryContact',
            'roleInfluence.isDecisionMaker',
            'communicationPreferences.preferredChannel'
        ];

        for (const field of fieldsToTrack) {
            const keys = field.split('.');
            let originalValue = original;
            let updateValue = updates;

            for (const key of keys) {
                originalValue = originalValue?.[key];
                updateValue = updateValue?.[key];
            }

            if (updateValue !== undefined &&
                JSON.stringify(originalValue) !== JSON.stringify(updateValue)) {
                changes[field] = {
                    old: originalValue,
                    new: updateValue
                };
            }
        }

        // Track email changes
        if (updates.contactDetails?.emails) {
            changes['contactDetails.emails'] = {
                old: original.contactDetails?.emails || [],
                new: updates.contactDetails.emails
            };
        }

        // Track phone changes
        if (updates.contactDetails?.phones) {
            changes['contactDetails.phones'] = {
                old: original.contactDetails?.phones || [],
                new: updates.contactDetails.phones
            };
        }

        return changes;
    }

    /**
     * Apply privacy rules to update data
     * @private
     * @param {Object} updateData - Data to process
     * @returns {Object} Processed data
     */
    async #applyPrivacyRules(updateData) {
        const processedData = { ...updateData };

        // Encrypt PII if enabled
        if (this.#privacySettings.encryptPII) {
            // In production, implement actual encryption
            if (processedData.personalInfo?.ssn) {
                processedData.personalInfo.ssn = '[ENCRYPTED]';
            }
        }

        // Apply data minimization
        if (this.#privacySettings.gdprCompliant) {
            // Remove unnecessary fields
            if (processedData.metadata?.internalNotes) {
                delete processedData.metadata.internalNotes;
            }
        }

        // Update privacy timestamps
        processedData.privacy = {
            ...processedData.privacy,
            lastUpdated: new Date(),
            gdprCompliant: this.#privacySettings.gdprCompliant
        };

        return processedData;
    }

    /**
     * Handle contact departure from company
     * @private
     * @param {string} contactId - Contact ID
     * @param {Object} updateData - Update data containing departure info
     * @param {string} userId - User performing update
     * @param {Object} session - MongoDB session
     */
    async #handleContactDeparture(contactId, updateData, userId, session) {
        try {
            // Set departure date
            const departureData = {
                'relationship.status': 'left_company',
                'relationship.endDate': new Date(),
                'relationship.departureReason': updateData.departureReason || 'unknown',
                'roleInfluence.isPrimaryContact': false,
                'roleInfluence.isDecisionMaker': false
            };

            await ClientContactModel.findByIdAndUpdate(
                contactId,
                { $set: departureData },
                { session }
            );

            // If this was the primary contact, we need to handle succession
            const contact = await ClientContactModel.findById(contactId);
            if (contact.roleInfluence?.isPrimaryContact) {
                await this.#handlePrimaryContactSuccession(contact.clientId, contactId, session);
            }

            // Create departure note
            await ClientNoteModel.create([{
                clientId: contact.clientId,
                tenantId: contact.tenantId,
                organizationId: contact.organizationId,
                content: {
                    title: `Contact Departure: ${contact.fullName}`,
                    body: `${contact.fullName} has left the company. Reason: ${updateData.departureReason || 'Not specified'}`,
                    format: 'plain_text'
                },
                classification: {
                    type: 'contact_management',
                    category: { primary: 'departure' },
                    importance: 'high'
                },
                context: {
                    relatedTo: {
                        contacts: [{
                            contactId: contact._id,
                            contactName: contact.fullName
                        }]
                    }
                },
                metadata: {
                    source: 'system_generated',
                    createdBy: userId
                }
            }], { session });

            logger.info('Contact departure handled', {
                contactId,
                reason: updateData.departureReason
            });
        } catch (error) {
            logger.error('Error handling contact departure', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    /**
     * Update communication preferences and subscriptions
     * @private
     * @param {Object} contact - Updated contact object
     * @param {Object} changes - Changes made to preferences
     */
    async #updateCommunicationPreferences(contact, changes) {
        try {
            if (!changes['communicationPreferences']) return;

            const preferences = contact.communicationPreferences;

            // Update email subscriptions if email service supports it
            if (preferences.subscriptions && this.#emailService.updateSubscriptions) {
                await this.#emailService.updateSubscriptions(
                    contact.primaryEmail,
                    preferences.subscriptions
                );
            }

            // Update SMS preferences if SMS service supports it
            if (preferences.smsOptIn !== undefined && this.#smsService.updatePreferences) {
                await this.#smsService.updatePreferences(
                    contact.primaryPhone,
                    { optIn: preferences.smsOptIn }
                );
            }

            logger.debug('Communication preferences updated', {
                contactId: contact._id,
                preferences
            });
        } catch (error) {
            logger.error('Error updating communication preferences', {
                error: error.message,
                contactId: contact._id
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Send notifications about contact updates
     * @private
     * @param {Object} contact - Updated contact
     * @param {Object} changes - Changes made
     * @param {string} userId - User who made changes
     */
    async #sendUpdateNotifications(contact, changes, userId) {
        try {
            const significantFields = [
                'relationship.status',
                'roleInfluence.isPrimaryContact',
                'roleInfluence.isDecisionMaker',
                'professionalInfo.jobTitle',
                'contactDetails.emails'
            ];

            const significantChanges = Object.keys(changes).filter(field =>
                significantFields.includes(field)
            );

            if (significantChanges.length === 0) return;

            // Notify relationship owner
            if (contact.relationship?.relationshipOwner &&
                contact.relationship.relationshipOwner.toString() !== userId) {
                await this.#notificationService.send({
                    type: 'contact_updated',
                    recipient: contact.relationship.relationshipOwner,
                    data: {
                        contactName: contact.fullName,
                        contactId: contact._id,
                        changes: significantChanges,
                        updatedBy: userId
                    }
                });
            }

            // Notify account manager
            const client = await ClientModel.findById(contact.clientId);
            if (client?.relationship?.accountManager &&
                client.relationship.accountManager.toString() !== userId) {
                await this.#notificationService.send({
                    type: 'client_contact_updated',
                    recipient: client.relationship.accountManager,
                    data: {
                        clientName: client.companyName,
                        contactName: contact.fullName,
                        changes: significantChanges
                    }
                });
            }

            logger.debug('Update notifications sent', {
                contactId: contact._id,
                changes: significantChanges
            });
        } catch (error) {
            logger.error('Error sending update notifications', {
                error: error.message,
                contactId: contact._id
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Anonymize contact data for GDPR compliance
     * @private
     * @param {string} contactId - Contact ID
     * @param {Object} session - MongoDB session
     */
    async #anonymizeContact(contactId, session) {
        try {
            const anonymizedData = {
                'personalInfo.firstName': '[ANONYMIZED]',
                'personalInfo.lastName': '[ANONYMIZED]',
                'personalInfo.dateOfBirth': null,
                'contactDetails.emails': [],
                'contactDetails.phones': [],
                'contactDetails.addresses': [],
                'socialMedia': {},
                'emergencyContact': {},
                'personalNotes': '[ANONYMIZED]',
                'metadata.anonymized': true,
                'metadata.anonymizedAt': new Date()
            };

            await ClientContactModel.findByIdAndUpdate(
                contactId,
                { $set: anonymizedData },
                { session }
            );

            logger.info('Contact anonymized', { contactId });
        } catch (error) {
            logger.error('Error anonymizing contact', {
                error: error.message,
                contactId
            });
            throw error;
        }
    }

    /**
     * Build relationship map from contacts
     * @private
     * @param {Array} contacts - Array of contacts
     * @returns {Object} Relationship map
     */
    async #buildRelationshipMap(contacts) {
        try {
            const relationshipMap = {
                directReports: new Map(),
                managers: new Map(),
                peers: new Map(),
                collaborators: new Map()
            };

            for (const contact of contacts) {
                if (contact.relationship?.keyRelationships) {
                    for (const rel of contact.relationship.keyRelationships) {
                        const relatedContact = contacts.find(c =>
                            c._id.toString() === rel.contactId.toString()
                        );

                        if (relatedContact) {
                            switch (rel.relationship) {
                                case 'reports_to':
                                    if (!relationshipMap.directReports.has(rel.contactId)) {
                                        relationshipMap.directReports.set(rel.contactId, []);
                                    }
                                    relationshipMap.directReports.get(rel.contactId).push(contact._id);
                                    break;
                                case 'manages':
                                    if (!relationshipMap.managers.has(contact._id)) {
                                        relationshipMap.managers.set(contact._id, []);
                                    }
                                    relationshipMap.managers.get(contact._id).push(rel.contactId);
                                    break;
                                case 'peer':
                                    if (!relationshipMap.peers.has(contact._id)) {
                                        relationshipMap.peers.set(contact._id, []);
                                    }
                                    relationshipMap.peers.get(contact._id).push(rel.contactId);
                                    break;
                                case 'collaborates_with':
                                    if (!relationshipMap.collaborators.has(contact._id)) {
                                        relationshipMap.collaborators.set(contact._id, []);
                                    }
                                    relationshipMap.collaborators.get(contact._id).push(rel.contactId);
                                    break;
                            }
                        }
                    }
                }
            }

            // Convert Maps to objects for JSON serialization
            return {
                directReports: Object.fromEntries(relationshipMap.directReports),
                managers: Object.fromEntries(relationshipMap.managers),
                peers: Object.fromEntries(relationshipMap.peers),
                collaborators: Object.fromEntries(relationshipMap.collaborators)
            };
        } catch (error) {
            logger.error('Error building relationship map', { error: error.message });
            return { directReports: {}, managers: {}, peers: {}, collaborators: {} };
        }
    }

    /**
     * Update relationship map for client
     * @private
     * @param {string} clientId - Client ID
     */
    async #updateRelationshipMap(clientId) {
        try {
            const contacts = await ClientContactModel.find({
                clientId,
                isDeleted: false,
                'relationship.status': 'active'
            });

            const relationshipMap = await this.#buildRelationshipMap(contacts);

            // Cache the relationship map
            const cacheKey = `relationship-map:${clientId}`;
            await this.#cacheService.set(cacheKey, relationshipMap, this.#defaultCacheTTL);

            logger.debug('Relationship map updated', { clientId });
        } catch (error) {
            logger.error('Error updating relationship map', {
                error: error.message,
                clientId
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Check communication preferences before sending
     * @private
     * @param {Object} contact - Contact object
     * @param {string} channel - Communication channel
     */
    async #checkCommunicationPreferences(contact, channel) {
        const preferences = contact.communicationPreferences || {};

        // Check if channel is preferred
        if (preferences.preferredChannel && preferences.preferredChannel !== channel) {
            logger.warn('Using non-preferred communication channel', {
                contactId: contact._id,
                preferred: preferences.preferredChannel,
                used: channel
            });
        }

        // Check opt-out status
        switch (channel) {
            case 'email':
                if (preferences.emailOptOut) {
                    throw new ValidationError('Contact has opted out of email communications', 'EMAIL_OPT_OUT');
                }
                break;
            case 'sms':
                if (!preferences.smsOptIn) {
                    throw new ValidationError('Contact has not opted in to SMS communications', 'SMS_OPT_OUT');
                }
                break;
        }

        // Check GDPR consent
        if (this.#privacySettings.gdprCompliant) {
            if (!contact.privacy?.consentStatus?.marketing && channel !== 'notification') {
                throw new ValidationError('No marketing consent for this contact', 'NO_MARKETING_CONSENT');
            }
        }

        return true;
    }

    /**
     * Validate communication content
     * @private
     * @param {Object} communication - Communication object
     */
    async #validateCommunicationContent(communication) {
        const errors = [];

        if (!communication.subject) {
            errors.push('Subject is required');
        }

        if (!communication.content) {
            errors.push('Content is required');
        }

        if (!communication.channel) {
            errors.push('Communication channel is required');
        }

        // Channel-specific validation
        switch (communication.channel) {
            case 'email':
                if (communication.subject && communication.subject.length > 200) {
                    errors.push('Email subject too long (max 200 characters)');
                }
                break;
            case 'sms':
                if (communication.content && communication.content.length > this.#communicationDefaults.sms.maxLength) {
                    errors.push(`SMS content too long (max ${this.#communicationDefaults.sms.maxLength} characters)`);
                }
                break;
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'COMMUNICATION_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Send SMS communication to contact
     * @private
     * @param {Object} contact - Contact object
     * @param {Object} communication - Communication details
     * @param {string} userId - User sending communication
     * @returns {Promise<Object>} SMS result
     */
    async #sendSMSCommunication(contact, communication, userId) {
        try {
            const primaryPhone = contact.contactDetails.phones.find(p => p.isPrimary)?.number ||
                contact.contactDetails.phones[0]?.number;

            if (!primaryPhone) {
                throw new ValidationError('Contact has no phone number', 'NO_PHONE');
            }

            const smsData = {
                to: primaryPhone,
                message: communication.content,
                from: communication.from || process.env.SMS_FROM_NUMBER
            };

            const result = await this.#smsService.send(smsData);

            return {
                messageId: result.messageId,
                status: 'sent',
                sentAt: new Date(),
                channel: 'sms',
                recipient: primaryPhone
            };
        } catch (error) {
            logger.error('Error sending SMS communication', {
                error: error.message,
                contactId: contact._id
            });
            throw error;
        }
    }

    /**
     * Send notification communication to contact
     * @private
     * @param {Object} contact - Contact object
     * @param {Object} communication - Communication details
     * @param {string} userId - User sending communication
     * @returns {Promise<Object>} Notification result
     */
    async #sendNotificationCommunication(contact, communication, userId) {
        try {
            const notificationData = {
                type: communication.notificationType || 'general',
                recipient: contact._id,
                title: communication.subject,
                message: communication.content,
                data: communication.data || {},
                priority: communication.priority || 'normal'
            };

            const result = await this.#notificationService.send(notificationData);

            return {
                notificationId: result.notificationId,
                status: 'sent',
                sentAt: new Date(),
                channel: 'notification',
                recipient: contact._id
            };
        } catch (error) {
            logger.error('Error sending notification communication', {
                error: error.message,
                contactId: contact._id
            });
            throw error;
        }
    }

    /**
     * Update engagement metrics for contact
     * @private
     * @param {string} contactId - Contact ID
     * @param {string} action - Action that triggered update
     */
    async #updateEngagementMetrics(contactId, action) {
        try {
            const updateData = {
                'analytics.lastEngagementDate': new Date()
            };

            switch (action) {
                case 'communication_sent':
                    updateData['$inc'] = { 'analytics.communicationsSent': 1 };
                    break;
                case 'email_opened':
                    updateData['$inc'] = { 'activities.emailOpens': 1 };
                    break;
                case 'email_clicked':
                    updateData['$inc'] = { 'activities.emailClicks': 1 };
                    break;
                case 'portal_login':
                    updateData['$inc'] = { 'activities.portalActivity.totalLogins': 1 };
                    updateData['activities.portalActivity.lastLogin'] = new Date();
                    break;
            }

            await ClientContactModel.findByIdAndUpdate(contactId, updateData);

            logger.debug('Engagement metrics updated', { contactId, action });
        } catch (error) {
            logger.error('Error updating engagement metrics', {
                error: error.message,
                contactId,
                action
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Validate interaction data
     * @private
     * @param {Object} interaction - Interaction data
     */
    async #validateInteractionData(interaction) {
        const errors = [];

        if (!interaction.type) {
            errors.push('Interaction type is required');
        }

        const validTypes = ['call', 'email', 'meeting', 'note', 'task', 'event', 'demo', 'support'];
        if (interaction.type && !validTypes.includes(interaction.type)) {
            errors.push(`Invalid interaction type. Must be one of: ${validTypes.join(', ')}`);
        }

        if (!interaction.notes) {
            errors.push('Interaction notes are required');
        }

        if (interaction.duration && (interaction.duration < 0 || interaction.duration > 86400)) {
            errors.push('Duration must be between 0 and 86400 seconds');
        }

        if (interaction.outcome) {
            const validOutcomes = ['successful', 'neutral', 'unsuccessful', 'follow_up_required'];
            if (!validOutcomes.includes(interaction.outcome)) {
                errors.push(`Invalid outcome. Must be one of: ${validOutcomes.join(', ')}`);
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'INTERACTION_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Update client activity metrics
     * @private
     * @param {string} clientId - Client ID
     * @param {string} action - Action type
     */
    async #updateClientActivity(clientId, action) {
        try {
            const updateData = {
                'analytics.lastActivity': new Date()
            };

            switch (action) {
                case 'contact_interaction':
                    updateData['$inc'] = { 'analytics.totalInteractions': 1 };
                    break;
                case 'communication_sent':
                    updateData['$inc'] = { 'analytics.communicationsSent': 1 };
                    break;
            }

            await ClientModel.findByIdAndUpdate(clientId, updateData);

            logger.debug('Client activity updated', { clientId, action });
        } catch (error) {
            logger.error('Error updating client activity', {
                error: error.message,
                clientId,
                action
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Schedule follow-up reminder
     * @private
     * @param {Object} contact - Contact object
     * @param {Object} interaction - Interaction data
     * @param {string} userId - User ID
     */
    async #scheduleFollowUp(contact, interaction, userId) {
        try {
            if (!interaction.followUpDate) {
                // Default to 1 week if no specific date provided
                interaction.followUpDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            }

            const followUpData = {
                type: 'follow_up_reminder',
                recipient: userId,
                scheduledFor: interaction.followUpDate,
                data: {
                    contactId: contact._id,
                    contactName: contact.fullName,
                    clientId: contact.clientId,
                    interactionType: interaction.type,
                    followUpNotes: interaction.followUpNotes || 'Follow up required'
                }
            };

            await this.#notificationService.schedule(followUpData);

            logger.debug('Follow-up scheduled', {
                contactId: contact._id,
                followUpDate: interaction.followUpDate
            });
        } catch (error) {
            logger.error('Error scheduling follow-up', {
                error: error.message,
                contactId: contact._id
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Validate communication preferences
     * @private
     * @param {Object} preferences - Preferences to validate
     */
    async #validateCommunicationPreferences(preferences) {
        const errors = [];

        if (preferences.preferredChannel) {
            const validChannels = ['email', 'phone', 'sms', 'portal', 'mail'];
            if (!validChannels.includes(preferences.preferredChannel)) {
                errors.push(`Invalid preferred channel. Must be one of: ${validChannels.join(', ')}`);
            }
        }

        if (preferences.preferredLanguage) {
            const validLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja'];
            if (!validLanguages.includes(preferences.preferredLanguage)) {
                errors.push(`Invalid preferred language. Must be one of: ${validLanguages.join(', ')}`);
            }
        }

        if (preferences.timezone && !/^[A-Za-z_]+\/[A-Za-z_]+$/.test(preferences.timezone)) {
            errors.push('Invalid timezone format');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'PREFERENCES_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Ensure GDPR compliance for communication preferences
     * @private
     * @param {Object} contact - Contact object
     * @param {Object} preferences - New preferences
     */
    async #ensureGDPRCompliance(contact, preferences) {
        try {
            // Check if we have proper consent
            const consentRequired = ['emailOptIn', 'smsOptIn', 'marketingOptIn'];

            for (const consentType of consentRequired) {
                if (preferences[consentType] === true) {
                    // Record consent timestamp
                    const consentRecord = {
                        type: consentType,
                        granted: true,
                        timestamp: new Date(),
                        source: 'preference_update',
                        ipAddress: preferences._metadata?.ipAddress,
                        userAgent: preferences._metadata?.userAgent
                    };

                    await ClientContactModel.findByIdAndUpdate(
                        contact._id,
                        {
                            $push: {
                                'privacy.consentHistory': consentRecord
                            },
                            $set: {
                                [`privacy.consentStatus.${consentType}`]: true,
                                'privacy.lastConsentUpdate': new Date()
                            }
                        }
                    );
                }
            }

            logger.debug('GDPR compliance ensured', {
                contactId: contact._id,
                preferences: Object.keys(preferences)
            });
        } catch (error) {
            logger.error('Error ensuring GDPR compliance', {
                error: error.message,
                contactId: contact._id
            });
            // Don't throw - log the error but continue
        }
    }

    /**
     * Log communication preference changes
     * @private
     * @param {Object} contact - Original contact
     * @param {Object} preferences - New preferences
     * @param {string} userId - User making changes
     */
    async #logPreferenceChanges(contact, preferences, userId) {
        try {
            const changes = [];

            const oldPrefs = contact.communicationPreferences || {};

            for (const [key, value] of Object.entries(preferences)) {
                if (oldPrefs[key] !== value) {
                    changes.push({
                        field: key,
                        oldValue: oldPrefs[key],
                        newValue: value
                    });
                }
            }

            if (changes.length > 0) {
                await ClientNoteModel.create({
                    clientId: contact.clientId,
                    tenantId: contact.tenantId,
                    organizationId: contact.organizationId,
                    content: {
                        title: `Communication Preferences Updated: ${contact.fullName}`,
                        body: `Preferences updated for ${contact.fullName}. Changes: ${changes.map(c => `${c.field}: ${c.oldValue} → ${c.newValue}`).join(', ')}`,
                        format: 'plain_text'
                    },
                    classification: {
                        type: 'preference_change',
                        category: { primary: 'communication' },
                        importance: 'low'
                    },
                    context: {
                        relatedTo: {
                            contacts: [{
                                contactId: contact._id,
                                contactName: contact.fullName
                            }]
                        }
                    },
                    metadata: {
                        source: 'system_generated',
                        createdBy: userId
                    }
                });

                logger.debug('Preference changes logged', {
                    contactId: contact._id,
                    changes: changes.length
                });
            }
        } catch (error) {
            logger.error('Error logging preference changes', {
                error: error.message,
                contactId: contact._id
            });
            // Don't throw - this is not critical
        }
    }

    /**
     * Generate engagement recommendations
     * @private
     * @param {Object} contact - Contact object
     * @param {string} level - Current engagement level
     * @returns {Array} Recommendations
     */
    async #generateEngagementRecommendations(contact, level) {
        const recommendations = [];

        switch (level) {
            case 'disengaged':
                recommendations.push({
                    priority: 'high',
                    action: 'immediate_outreach',
                    title: 'Immediate Outreach Required',
                    description: 'Contact has very low engagement. Schedule a personal call or meeting.',
                    estimatedImpact: 'high'
                });
                recommendations.push({
                    priority: 'medium',
                    action: 'value_demonstration',
                    title: 'Demonstrate Value',
                    description: 'Share success stories or case studies relevant to their role.',
                    estimatedImpact: 'medium'
                });
                break;

            case 'minimally_engaged':
                recommendations.push({
                    priority: 'medium',
                    action: 'personalized_content',
                    title: 'Send Personalized Content',
                    description: 'Share industry insights or resources tailored to their interests.',
                    estimatedImpact: 'medium'
                });
                recommendations.push({
                    priority: 'medium',
                    action: 'check_in_call',
                    title: 'Schedule Check-in Call',
                    description: 'Regular check-ins can help maintain the relationship.',
                    estimatedImpact: 'medium'
                });
                break;

            case 'somewhat_engaged':
                recommendations.push({
                    priority: 'low',
                    action: 'educational_content',
                    title: 'Share Educational Resources',
                    description: 'Provide webinars, whitepapers, or training materials.',
                    estimatedImpact: 'medium'
                });
                break;

            case 'engaged':
                recommendations.push({
                    priority: 'low',
                    action: 'maintain_momentum',
                    title: 'Maintain Current Engagement',
                    description: 'Continue current communication strategy.',
                    estimatedImpact: 'low'
                });
                break;

            case 'highly_engaged':
                recommendations.push({
                    priority: 'medium',
                    action: 'advocacy_opportunity',
                    title: 'Leverage for Advocacy',
                    description: 'Consider this contact for case studies or referrals.',
                    estimatedImpact: 'high'
                });
                break;
        }

        // Add time-based recommendations
        if (contact.daysSinceLastContact > 30) {
            recommendations.push({
                priority: 'high',
                action: 'overdue_contact',
                title: 'Overdue for Contact',
                description: `No contact in ${contact.daysSinceLastContact} days. Reach out soon.`,
                estimatedImpact: 'high'
            });
        }

        return recommendations;
    }

    /**
     * Personalize communication content
     * @private
     * @param {Object} comm - Communication object
     * @returns {Promise<Object>} Personalized communication
     */
    async #personalizeCommunication(comm) {
        try {
            const contact = await ClientContactModel.findById(comm.contactId);
            const client = await ClientModel.findById(contact.clientId);

            if (!contact || !client) {
                return comm;
            }

            let personalizedContent = comm.content;

            // Replace placeholders
            const replacements = {
                '{{firstName}}': contact.personalInfo?.firstName || '',
                '{{lastName}}': contact.personalInfo?.lastName || '',
                '{{fullName}}': contact.fullName || '',
                '{{jobTitle}}': contact.professionalInfo?.jobTitle || '',
                '{{company}}': client.companyName || '',
                '{{department}}': contact.professionalInfo?.department || ''
            };

            for (const [placeholder, value] of Object.entries(replacements)) {
                personalizedContent = personalizedContent.replace(
                    new RegExp(placeholder, 'g'),
                    value
                );
            }

            // Personalize subject if it exists
            if (comm.subject) {
                let personalizedSubject = comm.subject;
                for (const [placeholder, value] of Object.entries(replacements)) {
                    personalizedSubject = personalizedSubject.replace(
                        new RegExp(placeholder, 'g'),
                        value
                    );
                }
                comm.subject = personalizedSubject;
            }

            comm.content = personalizedContent;

            return comm;
        } catch (error) {
            logger.error('Error personalizing communication', {
                error: error.message,
                contactId: comm.contactId
            });
            return comm;
        }
    }

    /**
     * Select specific fields from contact object
     * @private
     * @param {Object} contact - Contact object
     * @param {Array} fields - Fields to select
     * @returns {Object} Object with selected fields
     */
    #selectFields(contact, fields) {
        const result = {};

        for (const field of fields) {
            if (field.includes('.')) {
                const keys = field.split('.');
                let value = contact;
                for (const key of keys) {
                    value = value?.[key];
                    if (value === undefined) break;
                }
                result[field.replace(/\./g, '_')] = value;
            } else {
                result[field] = contact[field];
            }
        }

        return result;
    }

    /**
     * Generate CSV export for contacts
     * @private
     * @param {Array} data - Contact data to export
     * @returns {Promise<Buffer>} CSV buffer
     */
    async #generateCSVExport(data) {
        try {
            if (data.length === 0) {
                return Buffer.from('No data to export');
            }

            const fields = Object.keys(data[0]);
            const csv = [
                fields.join(','),
                ...data.map(row =>
                    fields.map(field => {
                        const value = row[field];
                        if (value === null || value === undefined) return '';
                        const stringValue = value.toString();
                        return stringValue.includes(',') ? `"${stringValue}"` : stringValue;
                    }).join(',')
                )
            ].join('\n');

            return Buffer.from(csv);
        } catch (error) {
            logger.error('Error generating CSV export', { error: error.message });
            throw new AppError('Failed to generate CSV export', 'CSV_EXPORT_FAILED');
        }
    }

    /**
     * Generate vCard export for contacts
     * @private
     * @param {Array} data - Contact data to export
     * @returns {Promise<Buffer>} vCard buffer
     */
    async #generateVCardExport(data) {
        try {
            const vcards = data.map(contact => {
                const vcard = [
                    'BEGIN:VCARD',
                    'VERSION:3.0'
                ];

                if (contact.firstName || contact.lastName) {
                    vcard.push(`FN:${contact.firstName} ${contact.lastName}`.trim());
                    vcard.push(`N:${contact.lastName || ''};${contact.firstName || ''};;;`);
                }

                if (contact.jobTitle) {
                    vcard.push(`TITLE:${contact.jobTitle}`);
                }

                if (contact.company) {
                    vcard.push(`ORG:${contact.company}`);
                }

                if (contact.email) {
                    vcard.push(`EMAIL:${contact.email}`);
                }

                if (contact.phone) {
                    vcard.push(`TEL:${contact.phone}`);
                }

                vcard.push('END:VCARD');

                return vcard.join('\n');
            });

            return Buffer.from(vcards.join('\n\n'));
        } catch (error) {
            logger.error('Error generating vCard export', { error: error.message });
            throw new AppError('Failed to generate vCard export', 'VCARD_EXPORT_FAILED');
        }
    }

    // ==================== Additional Helper Methods ====================

    /**
     * Get valid status transitions for contacts
     * @private
     * @param {string} currentStatus - Current status
     * @returns {Array} Valid transition statuses
     */
    #getValidStatusTransitions(currentStatus) {
        const transitions = {
            active: ['inactive', 'left_company', 'on_leave'],
            inactive: ['active', 'left_company'],
            left_company: ['active'], // Allow reactivation if they return
            on_leave: ['active', 'left_company']
        };

        return transitions[currentStatus] || ['active', 'inactive'];
    }

    /**
     * Handle primary contact succession when current primary leaves
     * @private
     * @param {string} clientId - Client ID
     * @param {string} departedContactId - ID of departed contact
     * @param {Object} session - MongoDB session
     */
    async #handlePrimaryContactSuccession(clientId, departedContactId, session) {
        try {
            // Find potential successors (active decision makers or senior contacts)
            const potentialSuccessors = await ClientContactModel.find({
                clientId,
                isDeleted: false,
                'relationship.status': 'active',
                _id: { $ne: departedContactId },
                $or: [
                    { 'roleInfluence.isDecisionMaker': true },
                    { 'professionalInfo.seniority': { $in: ['director', 'manager', 'lead'] } }
                ]
            }).sort({ 'scoring.engagementScore.score': -1 }).limit(1);

            if (potentialSuccessors.length > 0) {
                await this.#updatePrimaryContact(clientId, potentialSuccessors[0]._id, session);

                logger.info('Primary contact succession completed', {
                    clientId,
                    newPrimaryContactId: potentialSuccessors[0]._id
                });
            } else {
                logger.warn('No suitable primary contact successor found', { clientId });
            }
        } catch (error) {
            logger.error('Error handling primary contact succession', {
                error: error.message,
                clientId,
                departedContactId
            });
        }
    }

    /**
     * Get exportable contact fields
     * @private
     */
    #getExportableContactFields(contact) {
        return {
            contactId: contact.contactId,
            firstName: contact.personalInfo?.firstName,
            lastName: contact.personalInfo?.lastName,
            jobTitle: contact.professionalInfo?.jobTitle,
            department: contact.professionalInfo?.department,
            email: contact.primaryEmail,
            phone: contact.primaryPhone,
            company: contact.clientId?.companyName,
            clientCode: contact.clientId?.clientCode,
            isPrimary: contact.roleInfluence?.isPrimaryContact,
            isDecisionMaker: contact.roleInfluence?.isDecisionMaker,
            influenceLevel: contact.roleInfluence?.influence?.level,
            engagementScore: contact.scoring?.engagementScore?.score,
            lastInteraction: contact.relationship?.lastInteraction?.date,
            status: contact.relationship?.status,
            createdAt: contact.createdAt
        };
    }
}

module.exports = ClientContactsService;