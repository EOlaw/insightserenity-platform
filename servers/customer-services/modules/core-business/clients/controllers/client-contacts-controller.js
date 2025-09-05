'use strict';

/**
 * @fileoverview Client contacts controller for comprehensive contact relationship management
 * @module servers/customer-services/modules/core-business/clients/controllers/client-contacts-controller
 */

const ClientContactsService = require('../services/client-contacts-service');
const ClientService = require('../services/client-service');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const { STATUS_CODES } = require('../../../../../../shared/lib/utils/constants/status-codes');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

/**
 * Controller class for client contacts operations
 * @class ClientContactsController
 */
class ClientContactsController {
  /**
   * Private fields
   */
  #contactsService;
  #clientService;
  #responseFormatter;
  #validationConfig;
  #securityConfig;
  #communicationConfig;
  #bulkConfig;
  #exportConfig;
  #searchConfig;
  #paginationConfig;
  #privacyConfig;
  #relationshipConfig;
  #engagementConfig;
  #rateLimitConfig;

  /**
   * Constructor
   */
  constructor() {
    this.#contactsService = new ClientContactsService();
    this.#clientService = new ClientService();
    this.#responseFormatter = new ResponseFormatter();
    this.#initializeConfigurations();
    
    // Bind all methods to preserve context
    this.createContact = this.createContact.bind(this);
    this.getContactById = this.getContactById.bind(this);
    this.updateContact = this.updateContact.bind(this);
    this.deleteContact = this.deleteContact.bind(this);
    this.getClientContacts = this.getClientContacts.bind(this);
    this.searchContacts = this.searchContacts.bind(this);
    this.bulkCreateContacts = this.bulkCreateContacts.bind(this);
    this.bulkUpdateContacts = this.bulkUpdateContacts.bind(this);
    this.bulkDeleteContacts = this.bulkDeleteContacts.bind(this);
    this.exportContacts = this.exportContacts.bind(this);
    this.importContacts = this.importContacts.bind(this);
    this.getContactHierarchy = this.getContactHierarchy.bind(this);
    this.mapContactRelationships = this.mapContactRelationships.bind(this);
    this.sendCommunication = this.sendCommunication.bind(this);
    this.recordInteraction = this.recordInteraction.bind(this);
    this.updateCommunicationPreferences = this.updateCommunicationPreferences.bind(this);
    this.calculateEngagementScore = this.calculateEngagementScore.bind(this);
    this.getContactActivityTimeline = this.getContactActivityTimeline.bind(this);
    this.transferContactOwnership = this.transferContactOwnership.bind(this);
    this.mergeContacts = this.mergeContacts.bind(this);
    this.duplicateContact = this.duplicateContact.bind(this);
    this.archiveContact = this.archiveContact.bind(this);
    this.unarchiveContact = this.unarchiveContact.bind(this);
    this.setPrimaryContact = this.setPrimaryContact.bind(this);
    this.addContactToGroup = this.addContactToGroup.bind(this);
    this.removeContactFromGroup = this.removeContactFromGroup.bind(this);
    this.tagContact = this.tagContact.bind(this);
    this.untagContact = this.untagContact.bind(this);
    this.getContactInsights = this.getContactInsights.bind(this);
    this.generateContactReport = this.generateContactReport.bind(this);
    this.validateContactData = this.validateContactData.bind(this);
    this.syncContactData = this.syncContactData.bind(this);
    this.getContactMetrics = this.getContactMetrics.bind(this);
    this.scheduleFollowUp = this.scheduleFollowUp.bind(this);
    this.getContactNotifications = this.getContactNotifications.bind(this);
    this.updateContactStatus = this.updateContactStatus.bind(this);
    this.getContactsByRole = this.getContactsByRole.bind(this);
    this.getContactAnalytics = this.getContactAnalytics.bind(this);
    
    logger.info('ClientContactsController initialized');
  }

  /**
   * Create a new contact for a client
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async createContact(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Creating contact for client: ${clientId}`);

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
      await this.#checkPermission(req, 'contacts.create');

      // Verify client exists and user has access
      const client = await this.#clientService.getClientById(clientId, {
        checkPermissions: true,
        userId,
        tenantId: req.tenant?.id
      });

      if (!client) {
        throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
      }

      // Prepare contact data
      const contactData = {
        ...req.body,
        tenantId: client.tenantId,
        organizationId: client.organizationId,
        metadata: {
          source: req.body.source || 'manual',
          importedBy: userId,
          importedAt: new Date(),
          ...req.body.metadata
        }
      };

      // Validate business rules
      await this.#validateContactBusinessRules(contactData, client);

      // Create contact options
      const options = {
        sendWelcome: req.body.sendWelcome === true,
        skipNotifications: req.body.skipNotifications === true,
        validateDuplicates: req.body.validateDuplicates !== false
      };

      // Create contact
      const contact = await this.#contactsService.createContact(
        clientId,
        contactData,
        userId,
        options
      );

      // Log contact creation
      await this.#logControllerAction('CONTACT_CREATED', {
        contactId: contact._id,
        clientId,
        userId,
        contactName: contact.fullName
      });

      // Update client contact metrics
      await this.#updateClientContactCount(clientId);

      // Send notifications
      if (!options.skipNotifications) {
        await this.#sendContactNotification('created', contact, client, req.user);
      }

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        this.#formatContactResponse(contact),
        'Contact created successfully',
        STATUS_CODES.CREATED
      );

      res.status(STATUS_CODES.CREATED).json(response);
    })(req, res, next);
  }

  /**
   * Get contact by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getContactById(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { contactId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Fetching contact: ${contactId}`);

      // Validate contact ID
      if (!CommonValidator.isValidObjectId(contactId)) {
        throw new ValidationError('Invalid contact ID format', 'INVALID_CONTACT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'contacts.read');

      // Parse options
      const options = {
        populate: req.query.populate ? req.query.populate.split(',') : [],
        includeDeleted: req.query.includeDeleted === 'true',
        includeEngagementData: req.query.includeEngagementData === 'true',
        includeInteractionHistory: req.query.includeInteractionHistory === 'true',
        checkPermissions: true,
        userId,
        tenantId: req.tenant?.id
      };

      // Get contact
      const contact = await this.#contactsService.getContactById(contactId, options);

      if (!contact) {
        throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
      }

      // Check contact-level access
      await this.#checkContactAccess(contact, req.user, 'read');

      // Add engagement metrics if requested
      let engagementData = null;
      if (options.includeEngagementData) {
        engagementData = await this.#contactsService.calculateEngagementScore(contactId);
      }

      // Add activity timeline if requested
      let activityTimeline = null;
      if (options.includeInteractionHistory) {
        activityTimeline = await this.#contactsService.getContactActivityTimeline(contactId, {
          limit: 50,
          types: ['interactions', 'communications', 'notes']
        });
      }

      // Log contact access
      await this.#logControllerAction('CONTACT_ACCESSED', {
        contactId,
        userId,
        options
      });

      // Format response
      const responseData = {
        ...this.#formatContactResponse(contact),
        ...(engagementData && { engagement: engagementData }),
        ...(activityTimeline && { activityTimeline })
      };

      const response = this.#responseFormatter.formatSuccess(
        responseData,
        'Contact retrieved successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Update contact information
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async updateContact(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { contactId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Updating contact: ${contactId}`);

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
      }

      // Validate contact ID
      if (!CommonValidator.isValidObjectId(contactId)) {
        throw new ValidationError('Invalid contact ID format', 'INVALID_CONTACT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'contacts.update');

      // Get existing contact
      const existingContact = await this.#contactsService.getContactById(contactId, {
        checkPermissions: true,
        userId,
        tenantId: req.tenant?.id
      });

      if (!existingContact) {
        throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
      }

      // Check contact access
      await this.#checkContactAccess(existingContact, req.user, 'update');

      // Prepare update data
      const updateData = {
        ...req.body,
        metadata: {
          ...req.body.metadata,
          lastModifiedBy: userId,
          lastModifiedAt: new Date()
        }
      };

      // Validate update data
      await this.#validateContactUpdateData(updateData, existingContact);

      // Update options
      const options = {
        skipNotifications: req.body.skipNotifications === true,
        reason: req.body.reason,
        validateDuplicates: req.body.validateDuplicates !== false
      };

      // Update contact
      const updatedContact = await this.#contactsService.updateContact(
        contactId,
        updateData,
        userId,
        options
      );

      // Log contact update
      await this.#logControllerAction('CONTACT_UPDATED', {
        contactId,
        userId,
        updatedFields: Object.keys(updateData)
      });

      // Send notifications
      if (!options.skipNotifications) {
        await this.#sendContactNotification('updated', updatedContact, null, req.user);
      }

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        this.#formatContactResponse(updatedContact),
        'Contact updated successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Delete contact
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async deleteContact(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { contactId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Deleting contact: ${contactId}`);

      // Validate contact ID
      if (!CommonValidator.isValidObjectId(contactId)) {
        throw new ValidationError('Invalid contact ID format', 'INVALID_CONTACT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'contacts.delete');

      // Get contact to verify access
      const contact = await this.#contactsService.getContactById(contactId, {
        checkPermissions: true,
        userId,
        tenantId: req.tenant?.id
      });

      if (!contact) {
        throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
      }

      // Check contact access
      await this.#checkContactAccess(contact, req.user, 'delete');

      // Parse deletion options
      const options = {
        hardDelete: req.body.hardDelete === true,
        reason: req.body.reason,
        anonymize: req.body.anonymize !== false,
        skipNotifications: req.body.skipNotifications === true,
        force: req.body.force === true
      };

      // Additional validation for hard delete
      if (options.hardDelete) {
        await this.#checkPermission(req, 'contacts.hardDelete');
        if (!options.reason) {
          throw new ValidationError('Reason is required for hard delete', 'REASON_REQUIRED');
        }
      }

      // Check if contact is primary contact
      if (contact.roleInfluence?.isPrimaryContact && !options.force) {
        throw new ValidationError(
          'Cannot delete primary contact without reassignment',
          'PRIMARY_CONTACT_DELETE'
        );
      }

      // Delete contact
      const result = await this.#contactsService.deleteContact(contactId, userId, options);

      // Update client contact count
      await this.#updateClientContactCount(contact.clientId, -1);

      // Log contact deletion
      await this.#logControllerAction('CONTACT_DELETED', {
        contactId,
        clientId: contact.clientId,
        userId,
        hardDelete: options.hardDelete,
        reason: options.reason
      });

      // Send notifications
      if (!options.skipNotifications) {
        await this.#sendContactNotification('deleted', contact, null, req.user);
      }

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        { deleted: true, hardDelete: options.hardDelete },
        `Contact ${options.hardDelete ? 'permanently deleted' : 'deleted'} successfully`
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Get contacts for a client
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getClientContacts(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      logger.info(`Fetching contacts for client: ${clientId}`);

      // Validate client ID
      if (!CommonValidator.isValidObjectId(clientId)) {
        throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'contacts.read');

      // Verify client access
      const client = await this.#clientService.getClientById(clientId, {
        checkPermissions: true,
        userId: req.user?.id || req.user?.adminId,
        tenantId: req.tenant?.id
      });

      if (!client) {
        throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
      }

      // Parse options
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 20, this.#paginationConfig.maxLimit),
        sort: this.#parseSortOptions(req.query.sort),
        includeInactive: req.query.includeInactive === 'true',
        includeDeleted: req.query.includeDeleted === 'true',
        role: req.query.role,
        department: req.query.department,
        seniority: req.query.seniority,
        engagementLevel: req.query.engagementLevel
      };

      // Build search criteria
      const searchCriteria = {
        clientId,
        ...(options.role && { 'professionalInfo.jobTitle': new RegExp(options.role, 'i') }),
        ...(options.department && { 'professionalInfo.department': options.department }),
        ...(options.seniority && { 'professionalInfo.seniority': options.seniority }),
        ...(options.engagementLevel && { 'scoring.engagementScore.level': options.engagementLevel })
      };

      // Get contacts with pagination
      const contactsData = await this.#contactsService.searchContacts(searchCriteria, options);

      // Add engagement statistics
      const engagementStats = await this.#calculateClientEngagementStats(clientId);

      // Log contacts access
      await this.#logControllerAction('CLIENT_CONTACTS_ACCESSED', {
        clientId,
        userId: req.user?.id,
        resultCount: contactsData.contacts.length
      });

      // Format response with pagination
      const response = this.#responseFormatter.formatPaginatedSuccess(
        contactsData.contacts.map(contact => this.#formatContactResponse(contact)),
        contactsData.pagination,
        'Client contacts retrieved successfully',
        { engagementStats }
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Search contacts with advanced filtering
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async searchContacts(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      logger.info('Searching contacts');

      // Check permissions
      await this.#checkPermission(req, 'contacts.read');

      // Parse search criteria
      const searchCriteria = this.#parseContactSearchCriteria(req.query);

      // Parse options
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 20, this.#paginationConfig.maxLimit),
        sort: this.#parseSortOptions(req.query.sort),
        populate: req.query.populate ? req.query.populate.split(',') : [],
        includeArchived: req.query.includeArchived === 'true',
        tenantId: req.tenant?.id
      };

      // Apply tenant filtering
      if (options.tenantId) {
        searchCriteria.tenantId = options.tenantId;
      }

      // Execute search
      const searchResults = await this.#contactsService.searchContacts(searchCriteria, options);

      // Filter results by permissions
      const authorizedContacts = await this.#filterContactsByPermissions(
        searchResults.contacts,
        req.user
      );

      // Add search insights
      const searchInsights = await this.#generateSearchInsights(searchResults, searchCriteria);

      // Log search
      await this.#logControllerAction('CONTACTS_SEARCHED', {
        criteria: searchCriteria,
        resultCount: authorizedContacts.length,
        userId: req.user?.id
      });

      // Format response
      const response = this.#responseFormatter.formatPaginatedSuccess(
        authorizedContacts.map(contact => this.#formatContactResponse(contact)),
        {
          ...searchResults.pagination,
          total: authorizedContacts.length
        },
        'Contacts retrieved successfully',
        { searchInsights }
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Get contact hierarchy for a client
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getContactHierarchy(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      logger.info(`Fetching contact hierarchy for client: ${clientId}`);

      // Validate client ID
      if (!CommonValidator.isValidObjectId(clientId)) {
        throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'contacts.read');

      // Verify client access
      const client = await this.#clientService.getClientById(clientId, {
        checkPermissions: true,
        userId: req.user?.id || req.user?.adminId,
        tenantId: req.tenant?.id
      });

      if (!client) {
        throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
      }

      // Parse options
      const options = {
        includeInactive: req.query.includeInactive === 'true',
        includeInfluenceMapping: req.query.includeInfluenceMapping === 'true',
        includeEngagementData: req.query.includeEngagementData === 'true'
      };

      // Get contact hierarchy
      const hierarchy = await this.#contactsService.getContactHierarchy(clientId, options);

      // Add organizational insights
      hierarchy.insights = await this.#generateHierarchyInsights(hierarchy, options);

      // Log hierarchy access
      await this.#logControllerAction('CONTACT_HIERARCHY_ACCESSED', {
        clientId,
        userId: req.user?.id,
        totalContacts: hierarchy.totalContacts
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        hierarchy,
        'Contact hierarchy retrieved successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Send communication to contact
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async sendCommunication(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { contactId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Sending communication to contact: ${contactId}`);

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
      }

      // Validate contact ID
      if (!CommonValidator.isValidObjectId(contactId)) {
        throw new ValidationError('Invalid contact ID format', 'INVALID_CONTACT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'contacts.communicate');

      // Get contact to verify access
      const contact = await this.#contactsService.getContactById(contactId, {
        checkPermissions: true,
        userId,
        tenantId: req.tenant?.id
      });

      if (!contact) {
        throw new NotFoundError('Contact not found', 'CONTACT_NOT_FOUND');
      }

      // Check communication permissions
      await this.#checkContactAccess(contact, req.user, 'communicate');

      // Prepare communication data
      const communication = {
        channel: req.body.channel,
        subject: req.body.subject,
        content: req.body.content,
        purpose: req.body.purpose,
        priority: req.body.priority || 'normal',
        scheduled: req.body.scheduled,
        attachments: req.body.attachments || [],
        trackingEnabled: req.body.trackingEnabled !== false,
        personalizations: req.body.personalizations || {}
      };

      // Validate communication data
      await this.#validateCommunicationData(communication);

      // Send communication
      const result = await this.#contactsService.sendCommunication(
        contactId,
        communication,
        userId
      );

      // Log communication
      await this.#logControllerAction('COMMUNICATION_SENT', {
        contactId,
        channel: communication.channel,
        subject: communication.subject,
        userId
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        result,
        'Communication sent successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Record interaction with contact
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async recordInteraction(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { contactId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Recording interaction for contact: ${contactId}`);

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
      }

      // Validate contact ID
      if (!CommonValidator.isValidObjectId(contactId)) {
        throw new ValidationError('Invalid contact ID format', 'INVALID_CONTACT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'contacts.interact');

      // Prepare interaction data
      const interaction = {
        type: req.body.type,
        channel: req.body.channel,
        direction: req.body.direction || 'outbound',
        subject: req.body.subject,
        notes: req.body.notes,
        duration: req.body.duration,
        outcome: req.body.outcome,
        sentiment: req.body.sentiment || 'neutral',
        followUpRequired: req.body.followUpRequired === true,
        followUpDate: req.body.followUpDate,
        participants: req.body.participants || [],
        attachments: req.body.attachments || [],
        tags: req.body.tags || []
      };

      // Validate interaction data
      await this.#validateInteractionData(interaction);

      // Record interaction
      const result = await this.#contactsService.recordInteraction(
        contactId,
        interaction,
        userId
      );

      // Schedule follow-up if needed
      if (interaction.followUpRequired && interaction.followUpDate) {
        await this.#scheduleFollowUp(contactId, interaction, userId);
      }

      // Log interaction
      await this.#logControllerAction('INTERACTION_RECORDED', {
        contactId,
        interactionType: interaction.type,
        outcome: interaction.outcome,
        userId
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        result,
        'Interaction recorded successfully',
        STATUS_CODES.CREATED
      );

      res.status(STATUS_CODES.CREATED).json(response);
    })(req, res, next);
  }

  /**
   * Bulk create contacts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async bulkCreateContacts(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Bulk creating contacts for client: ${clientId}`);

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
      await this.#checkPermission(req, 'contacts.bulkCreate');

      const { contacts: contactsData } = req.body;

      // Validate bulk data
      if (!Array.isArray(contactsData)) {
        throw new ValidationError('Contacts data must be an array', 'INVALID_BULK_DATA');
      }

      if (contactsData.length > this.#bulkConfig.maxOperationSize) {
        throw new ValidationError(
          `Bulk operation exceeds maximum size of ${this.#bulkConfig.maxOperationSize}`,
          'BULK_SIZE_EXCEEDED'
        );
      }

      // Verify client access
      const client = await this.#clientService.getClientById(clientId, {
        checkPermissions: true,
        userId,
        tenantId: req.tenant?.id
      });

      if (!client) {
        throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
      }

      // Prepare options
      const options = {
        validateAll: req.body.validateAll !== false,
        stopOnError: req.body.stopOnError === true,
        skipNotifications: req.body.skipNotifications === true,
        sendWelcome: req.body.sendWelcome === true
      };

      // Execute bulk creation
      const results = await this.#contactsService.bulkCreateContacts(
        clientId,
        contactsData,
        userId,
        options
      );

      // Update client contact count
      await this.#updateClientContactCount(clientId, results.successful.length);

      // Log bulk operation
      await this.#logControllerAction('BULK_CONTACTS_CREATED', {
        clientId,
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length,
        userId
      });

      // Send bulk notifications
      if (!options.skipNotifications && results.successful.length > 0) {
        await this.#sendBulkContactNotification('created', results.successful, client, req.user);
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
   * Export contacts in various formats
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async exportContacts(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      logger.info('Exporting contacts');

      // Check permissions
      await this.#checkPermission(req, 'contacts.export');

      // Parse export parameters
      const filters = this.#parseContactSearchCriteria(req.query);
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
        clientId: req.query.clientId,
        tenantId: req.tenant?.id,
        includeArchived: req.query.includeArchived === 'true',
        includeEngagementData: req.query.includeEngagementData === 'true',
        maxRecords: this.#exportConfig.maxRecords
      };

      // Export data
      const exportBuffer = await this.#contactsService.exportContacts(filters, format, options);

      // Log export
      await this.#logControllerAction('CONTACTS_EXPORTED', {
        format,
        filters,
        userId: req.user?.id
      });

      // Set response headers
      const fileName = `contacts_export_${Date.now()}.${format}`;
      const contentType = this.#getContentType(format);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', exportBuffer.length);

      res.status(STATUS_CODES.OK).send(exportBuffer);
    })(req, res, next);
  }

  /**
   * Calculate engagement score for contact
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async calculateEngagementScore(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { contactId } = req.params;
      logger.info(`Calculating engagement score for contact: ${contactId}`);

      // Validate contact ID
      if (!CommonValidator.isValidObjectId(contactId)) {
        throw new ValidationError('Invalid contact ID format', 'INVALID_CONTACT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'contacts.analytics');

      // Parse options
      const options = {
        recalculate: req.body.recalculate === true,
        includeDetails: req.query.includeDetails === 'true',
        includeRecommendations: req.query.includeRecommendations === 'true'
      };

      // Calculate engagement score
      const engagementData = await this.#contactsService.calculateEngagementScore(
        contactId,
        options
      );

      // Log calculation
      await this.#logControllerAction('ENGAGEMENT_SCORE_CALCULATED', {
        contactId,
        score: engagementData.score,
        level: engagementData.level,
        userId: req.user?.id
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        engagementData,
        'Engagement score calculated successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Private helper methods
   */
  
  #initializeConfigurations() {
    this.#validationConfig = {
      requiredFields: ['personalInfo.firstName', 'personalInfo.lastName'],
      maxNameLength: 100,
      maxEmailLength: 255,
      allowedContactChannels: ['email', 'phone', 'sms', 'linkedin'],
      allowedSeniorityLevels: ['intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'director', 'vp', 'svp', 'evp', 'c_suite']
    };

    this.#securityConfig = {
      encryptPII: true,
      auditContactAccess: true,
      gdprCompliant: true,
      requireMFAForSensitive: false
    };

    this.#communicationConfig = {
      maxRetries: 3,
      retryDelay: 60000,
      trackingEnabled: true,
      personalizationEnabled: true,
      allowedChannels: ['email', 'sms', 'phone', 'linkedin', 'whatsapp']
    };

    this.#bulkConfig = {
      maxOperationSize: 500,
      batchSize: 50,
      maxConcurrency: 3
    };

    this.#exportConfig = {
      supportedFormats: ['csv', 'excel', 'json', 'vcard'],
      maxRecords: 10000,
      maxFileSize: 50 * 1024 * 1024 // 50MB
    };

    this.#searchConfig = {
      maxResults: 1000,
      defaultFields: ['personalInfo.firstName', 'personalInfo.lastName', 'contactDetails.emails.address'],
      searchableFields: ['personalInfo', 'professionalInfo', 'contactDetails.emails', 'notes']
    };

    this.#paginationConfig = {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: { 'scoring.engagementScore.score': -1 }
    };

    this.#privacyConfig = {
      dataRetentionDays: 2555, // 7 years
      anonymizeOnDelete: true,
      encryptSensitiveFields: true,
      gdprCompliant: true
    };

    this.#relationshipConfig = {
      maxRelationships: 50,
      relationshipTypes: ['reports_to', 'manages', 'colleagues', 'partners', 'stakeholder'],
      influenceLevels: ['champion', 'supporter', 'neutral', 'skeptic', 'blocker']
    };

    this.#engagementConfig = {
      scoreUpdateFrequency: 86400000, // 24 hours
      engagementFactors: ['interactions', 'communications', 'portalActivity', 'eventParticipation'],
      engagementThresholds: {
        highly_engaged: 80,
        engaged: 60,
        somewhat_engaged: 40,
        minimally_engaged: 20
      }
    };

    this.#rateLimitConfig = {
      create: { windowMs: 900000, max: 100 }, // 100 creates per 15 minutes
      communicate: { windowMs: 60000, max: 50 }, // 50 communications per minute
      search: { windowMs: 60000, max: 200 } // 200 searches per minute
    };
  }

  async #checkPermission(req, permission) {
    const hasPermission = req.user?.permissions?.includes(permission) || 
                         req.user?.role === 'admin';
    
    if (!hasPermission) {
      throw new ForbiddenError(`Insufficient permissions: ${permission}`, 'PERMISSION_DENIED');
    }

    return true;
  }

  async #checkContactAccess(contact, user, action) {
    // Check if user has access to this specific contact
    const hasAccess = contact.tenantId?.toString() === user.tenantId?.toString() ||
                     contact.relationship?.relationshipOwner?.toString() === user.id?.toString() ||
                     user.role === 'admin';

    if (!hasAccess) {
      throw new ForbiddenError('Access denied to this contact', 'CONTACT_ACCESS_DENIED');
    }

    return true;
  }

  async #validateContactBusinessRules(contactData, client) {
    const errors = [];

    // Validate required fields
    for (const field of this.#validationConfig.requiredFields) {
      if (!this.#getNestedValue(contactData, field)) {
        errors.push(`${field} is required`);
      }
    }

    // Validate email format
    if (contactData.contactDetails?.emails) {
      for (const email of contactData.contactDetails.emails) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.address)) {
          errors.push(`Invalid email address: ${email.address}`);
        }
      }
    }

    // Validate seniority level
    if (contactData.professionalInfo?.seniority &&
        !this.#validationConfig.allowedSeniorityLevels.includes(contactData.professionalInfo.seniority)) {
      errors.push(`Invalid seniority level. Allowed values: ${this.#validationConfig.allowedSeniorityLevels.join(', ')}`);
    }

    if (errors.length > 0) {
      throw new ValidationError(errors.join('; '), 'CONTACT_BUSINESS_RULE_VALIDATION');
    }

    return true;
  }

  async #validateContactUpdateData(updateData, existingContact) {
    // Similar validation logic as business rules but for updates
    return this.#validateContactBusinessRules(updateData, null);
  }

  #parseContactSearchCriteria(query) {
    const criteria = {};

    if (query.search) criteria.search = query.search;
    if (query.clientId) criteria.clientId = query.clientId;
    if (query.name) criteria.name = query.name;
    if (query.email) criteria.email = query.email;
    if (query.jobTitle) criteria.jobTitle = query.jobTitle;
    if (query.department) criteria.department = query.department;
    if (query.seniority) criteria.seniority = query.seniority;
    if (query.isPrimaryContact) criteria.isPrimaryContact = query.isPrimaryContact === 'true';
    if (query.isDecisionMaker) criteria.isDecisionMaker = query.isDecisionMaker === 'true';
    if (query.engagementLevel) criteria.engagementLevel = query.engagementLevel;
    if (query.lastInteractionAfter) criteria.lastInteractionAfter = new Date(query.lastInteractionAfter);
    if (query.lastInteractionBefore) criteria.lastInteractionBefore = new Date(query.lastInteractionBefore);
    if (query.tags) criteria.tags = query.tags.split(',');

    return criteria;
  }

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

  #formatContactResponse(contact) {
    return {
      id: contact._id,
      contactId: contact.contactId,
      fullName: contact.fullName,
      personalInfo: contact.personalInfo,
      professionalInfo: contact.professionalInfo,
      contactDetails: contact.contactDetails,
      roleInfluence: contact.roleInfluence,
      relationship: contact.relationship,
      communicationPreferences: contact.communicationPreferences,
      scoring: contact.scoring,
      activities: contact.activities,
      tags: contact.tags,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt
    };
  }

  async #filterContactsByPermissions(contacts, user) {
    return contacts.filter(contact => {
      return contact.tenantId?.toString() === user.tenantId?.toString() ||
             user.role === 'admin';
    });
  }

  #getContentType(format) {
    const contentTypes = {
      csv: 'text/csv',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      json: 'application/json',
      vcard: 'text/vcard'
    };
    return contentTypes[format] || 'application/octet-stream';
  }

  #getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  async #validateCommunicationData(communication) {
    const errors = [];

    if (!communication.channel) {
      errors.push('Communication channel is required');
    } else if (!this.#communicationConfig.allowedChannels.includes(communication.channel)) {
      errors.push(`Invalid channel. Allowed channels: ${this.#communicationConfig.allowedChannels.join(', ')}`);
    }

    if (!communication.content) {
      errors.push('Communication content is required');
    }

    if (communication.channel === 'email' && !communication.subject) {
      errors.push('Email subject is required');
    }

    if (errors.length > 0) {
      throw new ValidationError(errors.join('; '), 'COMMUNICATION_VALIDATION');
    }

    return true;
  }

  async #validateInteractionData(interaction) {
    const errors = [];

    if (!interaction.type) {
      errors.push('Interaction type is required');
    }

    if (!interaction.notes) {
      errors.push('Interaction notes are required');
    }

    if (interaction.followUpRequired && !interaction.followUpDate) {
      errors.push('Follow-up date is required when follow-up is requested');
    }

    if (errors.length > 0) {
      throw new ValidationError(errors.join('; '), 'INTERACTION_VALIDATION');
    }

    return true;
  }

  async #scheduleFollowUp(contactId, interaction, userId) {
    try {
      logger.debug(`Scheduling follow-up for contact ${contactId} on ${interaction.followUpDate}`);
      // Implementation would schedule follow-up task
    } catch (error) {
      logger.error('Error scheduling follow-up:', error);
    }
  }

  async #generateSearchInsights(searchResults, searchCriteria) {
    try {
      return {
        totalMatches: searchResults.total,
        topEngagementLevel: 'engaged',
        mostCommonRole: 'manager'
      };
    } catch (error) {
      logger.error('Error generating search insights:', error);
      return null;
    }
  }

  async #generateHierarchyInsights(hierarchy, options) {
    try {
      return {
        organizationDepth: hierarchy.maxDepth || 3,
        influenceMapping: hierarchy.influenceMap || {},
        keyDecisionMakers: hierarchy.decisionMakers || []
      };
    } catch (error) {
      logger.error('Error generating hierarchy insights:', error);
      return null;
    }
  }

  async #logControllerAction(action, data) {
    try {
      logger.audit({
        category: 'CLIENT_CONTACTS_CONTROLLER',
        action,
        timestamp: new Date(),
        data
      });
    } catch (error) {
      logger.error('Error logging controller action:', error);
    }
  }

  async #sendContactNotification(eventType, contact, client, user) {
    try {
      logger.debug(`Sending ${eventType} notification for contact ${contact._id}`);
    } catch (error) {
      logger.error('Error sending contact notification:', error);
    }
  }

  async #sendBulkContactNotification(eventType, contacts, client, user) {
    try {
      logger.debug(`Sending bulk ${eventType} notification for ${contacts.length} contacts`);
    } catch (error) {
      logger.error('Error sending bulk contact notification:', error);
    }
  }

  async #updateClientContactCount(clientId, increment = 1) {
    try {
      logger.debug(`Updating contact count for client ${clientId} by ${increment}`);
    } catch (error) {
      logger.error('Error updating client contact count:', error);
    }
  }

  async #calculateClientEngagementStats(clientId) {
    try {
      return {
        totalContacts: 0,
        engagedContacts: 0,
        averageEngagementScore: 0,
        topEngagedContacts: []
      };
    } catch (error) {
      logger.error('Error calculating engagement stats:', error);
      return null;
    }
  }
}

// Export controller as singleton instance
module.exports = new ClientContactsController();