'use strict';

/**
 * @fileoverview Client documents controller for comprehensive document lifecycle management
 * @module servers/customer-services/modules/core-business/clients/controllers/client-documents-controller
 */

const ClientDocumentsService = require('../services/client-documents-service');
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
const path = require('path');

/**
 * Controller class for client documents operations
 * @class ClientDocumentsController
 */
class ClientDocumentsController {
  /**
   * Private fields
   */
  #documentsService;
  #clientService;
  #responseFormatter;
  #validationConfig;
  #securityConfig;
  #storageConfig;
  #complianceConfig;
  #bulkConfig;
  #exportConfig;
  #searchConfig;
  #paginationConfig;
  #workflowConfig;
  #versionConfig;
  #sharingConfig;
  #rateLimitConfig;
  #uploadConfig;

  /**
   * Constructor
   */
  constructor() {
    this.#documentsService = new ClientDocumentsService();
    this.#clientService = new ClientService();
    this.#responseFormatter = new ResponseFormatter();
    this.#initializeConfigurations();
    
    // Bind all methods to preserve context
    this.uploadDocument = this.uploadDocument.bind(this);
    this.getDocumentById = this.getDocumentById.bind(this);
    this.updateDocument = this.updateDocument.bind(this);
    this.deleteDocument = this.deleteDocument.bind(this);
    this.downloadDocument = this.downloadDocument.bind(this);
    this.getClientDocuments = this.getClientDocuments.bind(this);
    this.searchDocuments = this.searchDocuments.bind(this);
    this.bulkUploadDocuments = this.bulkUploadDocuments.bind(this);
    this.bulkDeleteDocuments = this.bulkDeleteDocuments.bind(this);
    this.createDocumentVersion = this.createDocumentVersion.bind(this);
    this.getDocumentVersions = this.getDocumentVersions.bind(this);
    this.shareDocument = this.shareDocument.bind(this);
    this.updateDocumentPermissions = this.updateDocumentPermissions.bind(this);
    this.startDocumentWorkflow = this.startDocumentWorkflow.bind(this);
    this.updateWorkflowStatus = this.updateWorkflowStatus.bind(this);
    this.requestDocumentSignatures = this.requestDocumentSignatures.bind(this);
    this.completeDocumentSignature = this.completeDocumentSignature.bind(this);
    this.applyRetentionPolicy = this.applyRetentionPolicy.bind(this);
    this.checkDocumentCompliance = this.checkDocumentCompliance.bind(this);
    this.getDocumentAnalytics = this.getDocumentAnalytics.bind(this);
    this.generateDocumentReport = this.generateDocumentReport.bind(this);
    this.archiveDocument = this.archiveDocument.bind(this);
    this.unarchiveDocument = this.unarchiveDocument.bind(this);
    this.lockDocument = this.lockDocument.bind(this);
    this.unlockDocument = this.unlockDocument.bind(this);
    this.tagDocument = this.tagDocument.bind(this);
    this.untagDocument = this.untagDocument.bind(this);
    this.moveDocument = this.moveDocument.bind(this);
    this.copyDocument = this.copyDocument.bind(this);
    this.getDocumentAuditTrail = this.getDocumentAuditTrail.bind(this);
    this.generateThumbnails = this.generateThumbnails.bind(this);
    this.extractDocumentText = this.extractDocumentText.bind(this);
    this.validateDocumentStructure = this.validateDocumentStructure.bind(this);
    this.scanDocumentForViruses = this.scanDocumentForViruses.bind(this);
    this.optimizeDocument = this.optimizeDocument.bind(this);
    this.convertDocumentFormat = this.convertDocumentFormat.bind(this);
    this.getDocumentPreview = this.getDocumentPreview.bind(this);
    this.getDocumentMetadata = this.getDocumentMetadata.bind(this);
    this.updateDocumentMetadata = this.updateDocumentMetadata.bind(this);
    this.getDocumentActivity = this.getDocumentActivity.bind(this);
    this.getStorageStatistics = this.getStorageStatistics.bind(this);
    this.cleanupExpiredDocuments = this.cleanupExpiredDocuments.bind(this);
    
    logger.info('ClientDocumentsController initialized');
  }

  /**
   * Upload a document for a client
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async uploadDocument(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Uploading document for client: ${clientId}`);

      // Validate client ID
      if (!CommonValidator.isValidObjectId(clientId)) {
        throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
      }

      // Check if file was uploaded
      if (!req.file) {
        throw new ValidationError('Document file is required', 'FILE_REQUIRED');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.create');

      // Verify client exists and user has access
      const client = await this.#clientService.getClientById(clientId, {
        checkPermissions: true,
        userId,
        tenantId: req.tenant?.id
      });

      if (!client) {
        throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
      }

      // Validate file
      await this.#validateUploadedFile(req.file);

      // Prepare file data
      const fileData = {
        originalName: req.file.originalname,
        name: req.body.name || req.file.originalname,
        description: req.body.description,
        type: req.body.type || 'document',
        category: req.body.category ? JSON.parse(req.body.category) : { primary: 'general' },
        classification: req.body.classification ? JSON.parse(req.body.classification) : { level: 'internal' },
        keywords: req.body.keywords ? req.body.keywords.split(',') : [],
        mimeType: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
        permissions: req.body.permissions ? JSON.parse(req.body.permissions) : {}
      };

      // Upload options
      const options = {
        projectId: req.body.projectId,
        engagementId: req.body.engagementId,
        storageProvider: req.body.storageProvider,
        generateThumbnails: req.body.generateThumbnails !== 'false',
        extractText: req.body.extractText !== 'false',
        scanForViruses: req.body.scanForViruses !== 'false'
      };

      // Upload document
      const document = await this.#documentsService.uploadDocument(
        clientId,
        fileData,
        userId,
        options
      );

      // Log document upload
      await this.#logControllerAction('DOCUMENT_UPLOADED', {
        documentId: document._id,
        clientId,
        fileName: fileData.originalName,
        fileSize: fileData.size,
        userId
      });

      // Update client document count
      await this.#updateClientDocumentCount(clientId, 1);

      // Send upload notifications
      if (req.body.notifyStakeholders === 'true') {
        await this.#sendDocumentNotification('uploaded', document, client, req.user);
      }

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        this.#formatDocumentResponse(document),
        'Document uploaded successfully',
        STATUS_CODES.CREATED
      );

      res.status(STATUS_CODES.CREATED).json(response);
    })(req, res, next);
  }

  /**
   * Get document by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getDocumentById(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { documentId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Fetching document: ${documentId}`);

      // Validate document ID
      if (!CommonValidator.isValidObjectId(documentId)) {
        throw new ValidationError('Invalid document ID format', 'INVALID_DOCUMENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.read');

      // Parse options
      const options = {
        includeContent: req.query.includeContent === 'true',
        includeVersions: req.query.includeVersions === 'true',
        includeAuditTrail: req.query.includeAuditTrail === 'true',
        checkPermissions: true
      };

      // Get document
      const document = await this.#documentsService.getDocumentById(
        documentId,
        userId,
        options
      );

      if (!document) {
        throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
      }

      // Check document-level access
      await this.#checkDocumentAccess(document, req.user, 'read');

      // Add additional data if requested
      let additionalData = {};

      if (req.query.includeAnalytics === 'true') {
        additionalData.analytics = await this.#getDocumentAnalyticsData(documentId);
      }

      if (req.query.includeRelatedDocuments === 'true') {
        additionalData.relatedDocuments = await this.#getRelatedDocuments(documentId);
      }

      // Log document access
      await this.#logControllerAction('DOCUMENT_ACCESSED', {
        documentId,
        userId,
        options
      });

      // Format response
      const responseData = {
        ...this.#formatDocumentResponse(document),
        ...additionalData
      };

      const response = this.#responseFormatter.formatSuccess(
        responseData,
        'Document retrieved successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Download document
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async downloadDocument(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { documentId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Downloading document: ${documentId}`);

      // Validate document ID
      if (!CommonValidator.isValidObjectId(documentId)) {
        throw new ValidationError('Invalid document ID format', 'INVALID_DOCUMENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.download');

      // Parse download options
      const options = {
        format: req.query.format,
        watermark: req.query.watermark === 'true',
        version: req.query.version
      };

      // Download document
      const downloadResult = await this.#documentsService.downloadDocument(
        documentId,
        userId,
        options
      );

      // Log document download
      await this.#logControllerAction('DOCUMENT_DOWNLOADED', {
        documentId,
        userId,
        format: options.format,
        size: downloadResult.metadata.size
      });

      // Set response headers
      res.setHeader('Content-Type', downloadResult.metadata.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadResult.metadata.fileName}"`);
      res.setHeader('Content-Length', downloadResult.metadata.size);

      // Send file
      res.status(STATUS_CODES.OK).send(downloadResult.buffer);
    })(req, res, next);
  }

  /**
   * Get documents for a client
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getClientDocuments(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      logger.info(`Fetching documents for client: ${clientId}`);

      // Validate client ID
      if (!CommonValidator.isValidObjectId(clientId)) {
        throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.read');

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
        includeArchived: req.query.includeArchived === 'true',
        includeDeleted: req.query.includeDeleted === 'true',
        type: req.query.type,
        category: req.query.category,
        classification: req.query.classification,
        projectId: req.query.projectId,
        engagementId: req.query.engagementId
      };

      // Build search criteria
      const searchCriteria = {
        clientId,
        ...(options.type && { 'documentInfo.type': options.type }),
        ...(options.category && { 'documentInfo.category.primary': options.category }),
        ...(options.classification && { 'documentInfo.classification.level': options.classification }),
        ...(options.projectId && { projectId: options.projectId }),
        ...(options.engagementId && { engagementId: options.engagementId })
      };

      // Get documents with pagination
      const documentsData = await this.#documentsService.searchDocuments(searchCriteria, options);

      // Add storage statistics
      const storageStats = await this.#getClientStorageStats(clientId);

      // Log documents access
      await this.#logControllerAction('CLIENT_DOCUMENTS_ACCESSED', {
        clientId,
        userId: req.user?.id,
        resultCount: documentsData.documents.length
      });

      // Format response with pagination
      const response = this.#responseFormatter.formatPaginatedSuccess(
        documentsData.documents.map(doc => this.#formatDocumentResponse(doc)),
        documentsData.pagination,
        'Client documents retrieved successfully',
        { storageStats }
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Search documents with advanced filtering
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async searchDocuments(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      logger.info('Searching documents');

      // Check permissions
      await this.#checkPermission(req, 'documents.read');

      // Parse search criteria
      const searchCriteria = this.#parseDocumentSearchCriteria(req.query);

      // Parse options
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 20, this.#paginationConfig.maxLimit),
        sort: this.#parseSortOptions(req.query.sort),
        tenantId: req.tenant?.id,
        includeContent: req.query.includeContent === 'true',
        facets: req.query.facets === 'true'
      };

      // Apply tenant filtering
      if (options.tenantId) {
        searchCriteria.tenantId = options.tenantId;
      }

      // Execute search
      const searchResults = await this.#documentsService.searchDocuments(searchCriteria, options);

      // Filter results by permissions
      const authorizedDocuments = await this.#filterDocumentsByPermissions(
        searchResults.documents,
        req.user
      );

      // Log search
      await this.#logControllerAction('DOCUMENTS_SEARCHED', {
        criteria: searchCriteria,
        resultCount: authorizedDocuments.length,
        userId: req.user?.id
      });

      // Format response
      const response = this.#responseFormatter.formatPaginatedSuccess(
        authorizedDocuments.map(doc => this.#formatDocumentResponse(doc)),
        {
          ...searchResults.pagination,
          total: authorizedDocuments.length
        },
        'Documents retrieved successfully',
        { facets: searchResults.facets }
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Create new version of document
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async createDocumentVersion(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { documentId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Creating new version for document: ${documentId}`);

      // Validate document ID
      if (!CommonValidator.isValidObjectId(documentId)) {
        throw new ValidationError('Invalid document ID format', 'INVALID_DOCUMENT_ID');
      }

      // Check if file was uploaded
      if (!req.file) {
        throw new ValidationError('New version file is required', 'FILE_REQUIRED');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.version');

      // Validate file
      await this.#validateUploadedFile(req.file);

      // Prepare file data
      const fileData = {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer
      };

      // Version options
      const options = {
        changeNotes: req.body.changeNotes,
        majorVersion: req.body.majorVersion === 'true',
        skipNotifications: req.body.skipNotifications === 'true'
      };

      // Create document version
      const newVersion = await this.#documentsService.createDocumentVersion(
        documentId,
        fileData,
        userId,
        options
      );

      // Log version creation
      await this.#logControllerAction('DOCUMENT_VERSION_CREATED', {
        originalDocumentId: documentId,
        newVersionId: newVersion._id,
        versionNumber: newVersion.versioning?.versionString,
        userId
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        this.#formatDocumentResponse(newVersion),
        'Document version created successfully',
        STATUS_CODES.CREATED
      );

      res.status(STATUS_CODES.CREATED).json(response);
    })(req, res, next);
  }

  /**
   * Share document with users or external parties
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async shareDocument(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { documentId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Sharing document: ${documentId}`);

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
      }

      // Validate document ID
      if (!CommonValidator.isValidObjectId(documentId)) {
        throw new ValidationError('Invalid document ID format', 'INVALID_DOCUMENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.share');

      // Prepare share data
      const shareData = {
        type: req.body.type, // 'internal', 'external', 'public_link'
        recipientEmail: req.body.recipientEmail,
        recipientId: req.body.recipientId,
        permissions: req.body.permissions || ['read'],
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        message: req.body.message,
        requiresPassword: req.body.requiresPassword === true,
        allowDownload: req.body.allowDownload !== false,
        trackAccess: req.body.trackAccess !== false,
        notifyOnAccess: req.body.notifyOnAccess === true
      };

      // Validate share data
      await this.#validateShareData(shareData);

      // Share document
      const shareResult = await this.#documentsService.shareDocument(
        documentId,
        shareData,
        userId
      );

      // Log document share
      await this.#logControllerAction('DOCUMENT_SHARED', {
        documentId,
        shareType: shareData.type,
        recipient: shareData.recipientEmail || shareData.recipientId,
        permissions: shareData.permissions,
        userId
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        shareResult,
        'Document shared successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Start document workflow
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async startDocumentWorkflow(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { documentId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Starting workflow for document: ${documentId}`);

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
      }

      // Validate document ID
      if (!CommonValidator.isValidObjectId(documentId)) {
        throw new ValidationError('Invalid document ID format', 'INVALID_DOCUMENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.workflow');

      // Prepare workflow data
      const workflowData = {
        templateId: req.body.templateId,
        assignees: req.body.assignees || {},
        stepTypes: req.body.stepTypes || {},
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        priority: req.body.priority || 'normal',
        autoProgress: req.body.autoProgress === true,
        notificationSettings: req.body.notificationSettings || {}
      };

      // Start workflow
      const workflowInstance = await this.#documentsService.startDocumentWorkflow(
        documentId,
        req.body.workflowType,
        workflowData,
        userId
      );

      // Log workflow start
      await this.#logControllerAction('DOCUMENT_WORKFLOW_STARTED', {
        documentId,
        workflowType: req.body.workflowType,
        workflowId: workflowInstance.id,
        userId
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        workflowInstance,
        'Document workflow started successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Request document signatures
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async requestDocumentSignatures(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { documentId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Requesting signatures for document: ${documentId}`);

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
      }

      // Validate document ID
      if (!CommonValidator.isValidObjectId(documentId)) {
        throw new ValidationError('Invalid document ID format', 'INVALID_DOCUMENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.signatures');

      // Validate signatories
      if (!Array.isArray(req.body.signatories) || req.body.signatories.length === 0) {
        throw new ValidationError('At least one signatory is required', 'SIGNATORIES_REQUIRED');
      }

      // Prepare signature options
      const options = {
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        reminderSettings: req.body.reminderSettings || {},
        signatureType: req.body.signatureType || 'electronic',
        requireAllSignatures: req.body.requireAllSignatures !== false,
        allowDelegation: req.body.allowDelegation === true,
        customMessage: req.body.customMessage
      };

      // Request signatures
      const signatureRequest = await this.#documentsService.requestDocumentSignatures(
        documentId,
        req.body.signatories,
        options,
        userId
      );

      // Log signature request
      await this.#logControllerAction('DOCUMENT_SIGNATURES_REQUESTED', {
        documentId,
        signatoryCount: req.body.signatories.length,
        signatureType: options.signatureType,
        userId
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        signatureRequest,
        'Document signature request created successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Apply retention policy to document
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async applyRetentionPolicy(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { documentId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Applying retention policy to document: ${documentId}`);

      // Validate document ID
      if (!CommonValidator.isValidObjectId(documentId)) {
        throw new ValidationError('Invalid document ID format', 'INVALID_DOCUMENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.compliance');

      // Validate policy type
      const { policyType } = req.body;
      if (!policyType) {
        throw new ValidationError('Policy type is required', 'POLICY_TYPE_REQUIRED');
      }

      const validPolicies = ['contracts', 'financial', 'legal', 'general'];
      if (!validPolicies.includes(policyType)) {
        throw new ValidationError(
          `Invalid policy type. Valid options: ${validPolicies.join(', ')}`,
          'INVALID_POLICY_TYPE'
        );
      }

      // Apply retention policy
      const retentionResult = await this.#documentsService.applyRetentionPolicy(
        documentId,
        policyType,
        userId
      );

      // Log retention policy application
      await this.#logControllerAction('RETENTION_POLICY_APPLIED', {
        documentId,
        policyType,
        retentionPeriod: retentionResult.retentionPeriod,
        userId
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        retentionResult,
        'Retention policy applied successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Check document compliance
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async checkDocumentCompliance(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { documentId } = req.params;
      logger.info(`Checking compliance for document: ${documentId}`);

      // Validate document ID
      if (!CommonValidator.isValidObjectId(documentId)) {
        throw new ValidationError('Invalid document ID format', 'INVALID_DOCUMENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.compliance');

      // Parse regulations to check
      const regulations = req.query.regulations ? 
        req.query.regulations.split(',') : 
        ['GDPR', 'HIPAA', 'SOX', 'PCI_DSS'];

      // Check compliance
      const complianceResults = await this.#documentsService.checkDocumentCompliance(
        documentId,
        regulations
      );

      // Log compliance check
      await this.#logControllerAction('DOCUMENT_COMPLIANCE_CHECKED', {
        documentId,
        regulations,
        compliant: complianceResults.overallCompliant,
        userId: req.user?.id
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        complianceResults,
        'Document compliance check completed'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Get document analytics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getDocumentAnalytics(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      logger.info(`Fetching document analytics${clientId ? ` for client: ${clientId}` : ''}`);

      // Validate client ID if provided
      if (clientId && !CommonValidator.isValidObjectId(clientId)) {
        throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.analytics');

      // Parse options
      const options = {
        dateRange: this.#parseDateRange(req.query),
        tenantId: req.tenant?.id,
        includeStorageStats: req.query.includeStorageStats !== 'false',
        includeAccessStats: req.query.includeAccessStats !== 'false',
        includeComplianceStats: req.query.includeComplianceStats === 'true'
      };

      // Get analytics
      const analytics = await this.#documentsService.getDocumentAnalytics(clientId, options);

      // Add insights
      analytics.insights = await this.#generateDocumentInsights(analytics, options);

      // Log analytics access
      await this.#logControllerAction('DOCUMENT_ANALYTICS_ACCESSED', {
        clientId,
        dateRange: options.dateRange,
        userId: req.user?.id
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        analytics,
        'Document analytics retrieved successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Bulk upload documents
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async bulkUploadDocuments(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Bulk uploading documents for client: ${clientId}`);

      // Validate client ID
      if (!CommonValidator.isValidObjectId(clientId)) {
        throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
      }

      // Check if files were uploaded
      if (!req.files || req.files.length === 0) {
        throw new ValidationError('At least one document file is required', 'FILES_REQUIRED');
      }

      // Check permissions
      await this.#checkPermission(req, 'documents.bulkCreate');

      // Validate bulk size
      if (req.files.length > this.#bulkConfig.maxOperationSize) {
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

      // Prepare files data
      const filesData = req.files.map(file => ({
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        buffer: file.buffer
      }));

      // Bulk upload options
      const options = {
        validateAll: req.body.validateAll !== 'false',
        skipNotifications: req.body.skipNotifications === 'true',
        generateThumbnails: req.body.generateThumbnails !== 'false',
        extractText: req.body.extractText !== 'false',
        scanForViruses: req.body.scanForViruses !== 'false'
      };

      // Execute bulk upload
      const results = await this.#documentsService.bulkUploadDocuments(
        clientId,
        filesData,
        userId,
        options
      );

      // Update client document count
      await this.#updateClientDocumentCount(clientId, results.successful.length);

      // Log bulk operation
      await this.#logControllerAction('BULK_DOCUMENTS_UPLOADED', {
        clientId,
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length,
        userId
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        results,
        `Bulk upload completed: ${results.successful.length} uploaded, ${results.failed.length} failed`
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Private helper methods
   */
  
  #initializeConfigurations() {
    this.#validationConfig = {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedExtensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.jpg', '.png'],
      allowedMimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'text/plain'
      ]
    };

    this.#securityConfig = {
      encryptSensitiveDocuments: true,
      virusScanningEnabled: true,
      auditDocumentAccess: true,
      watermarkEnabled: false
    };

    this.#storageConfig = {
      defaultProvider: 'aws_s3',
      enableCompression: true,
      enableEncryption: true,
      storageClasses: ['standard', 'infrequent', 'archive']
    };

    this.#complianceConfig = {
      retentionPolicies: {
        contracts: { years: 7, permanent: false },
        financial: { years: 7, permanent: false },
        legal: { years: 10, permanent: true },
        general: { years: 3, permanent: false }
      },
      encryptionRequired: ['financial', 'legal', 'confidential'],
      auditRequired: ['contracts', 'financial', 'legal']
    };

    this.#bulkConfig = {
      maxOperationSize: 100,
      batchSize: 10,
      maxConcurrency: 3
    };

    this.#exportConfig = {
      supportedFormats: ['zip', 'tar'],
      maxArchiveSize: 1024 * 1024 * 1024, // 1GB
      includeMetadata: true
    };

    this.#searchConfig = {
      maxResults: 1000,
      fullTextSearchEnabled: true,
      facetedSearchEnabled: true
    };

    this.#paginationConfig = {
      defaultLimit: 20,
      maxLimit: 100,
      defaultSort: { createdAt: -1 }
    };

    this.#workflowConfig = {
      supportedWorkflows: ['approval', 'review', 'signature'],
      maxSteps: 10,
      autoProgressEnabled: true
    };

    this.#versionConfig = {
      maxVersions: 100,
      autoVersioning: true,
      versionNaming: 'semantic'
    };

    this.#sharingConfig = {
      maxShares: 1000,
      defaultExpiration: 30, // days
      passwordProtection: true
    };

    this.#uploadConfig = {
      tempDirectory: '/tmp/uploads',
      cleanupInterval: 3600000, // 1 hour
      maxConcurrentUploads: 10
    };

    this.#rateLimitConfig = {
      upload: { windowMs: 900000, max: 50 }, // 50 uploads per 15 minutes
      download: { windowMs: 60000, max: 100 }, // 100 downloads per minute
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

  async #checkDocumentAccess(document, user, action) {
    const hasAccess = document.tenantId?.toString() === user.tenantId?.toString() ||
                     document.accessControl?.owner?.toString() === user.id?.toString() ||
                     user.role === 'admin';

    if (!hasAccess) {
      throw new ForbiddenError('Access denied to this document', 'DOCUMENT_ACCESS_DENIED');
    }

    return true;
  }

  async #validateUploadedFile(file) {
    const errors = [];

    // Check file size
    if (file.size > this.#validationConfig.maxFileSize) {
      errors.push(`File size exceeds maximum of ${this.#validationConfig.maxFileSize / 1024 / 1024}MB`);
    }

    // Check file extension
    const extension = path.extname(file.originalname).toLowerCase();
    if (!this.#validationConfig.allowedExtensions.includes(extension)) {
      errors.push(`File extension ${extension} is not allowed`);
    }

    // Check MIME type
    if (!this.#validationConfig.allowedMimeTypes.includes(file.mimetype)) {
      errors.push(`File type ${file.mimetype} is not allowed`);
    }

    // Check file name
    if (!file.originalname || file.originalname.length > 255) {
      errors.push('Invalid file name');
    }

    if (errors.length > 0) {
      throw new ValidationError(errors.join('; '), 'FILE_VALIDATION_FAILED');
    }

    return true;
  }

  #parseDocumentSearchCriteria(query) {
    const criteria = {};

    if (query.search) criteria.query = query.search;
    if (query.clientId) criteria.clientId = query.clientId;
    if (query.type) criteria.filters = { ...criteria.filters, type: query.type };
    if (query.category) criteria.filters = { ...criteria.filters, category: query.category };
    if (query.classification) criteria.filters = { ...criteria.filters, classification: query.classification };
    if (query.tags) criteria.filters = { ...criteria.filters, tags: query.tags.split(',') };
    if (query.projectId) criteria.filters = { ...criteria.filters, projectId: query.projectId };
    if (query.createdAfter) criteria.filters = { ...criteria.filters, createdAfter: new Date(query.createdAfter) };
    if (query.createdBefore) criteria.filters = { ...criteria.filters, createdBefore: new Date(query.createdBefore) };

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

  #parseDateRange(query) {
    return {
      start: query.dateFrom ? new Date(query.dateFrom) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      end: query.dateTo ? new Date(query.dateTo) : new Date()
    };
  }

  #formatDocumentResponse(document) {
    return {
      id: document._id,
      documentId: document.documentId,
      name: document.documentInfo?.name,
      type: document.documentInfo?.type,
      category: document.documentInfo?.category,
      classification: document.documentInfo?.classification,
      fileDetails: document.fileDetails,
      storage: {
        provider: document.storage?.provider,
        size: document.fileDetails?.size,
        url: document.downloadUrl
      },
      versioning: document.versioning,
      accessControl: document.accessControl,
      lifecycle: document.lifecycle,
      analytics: document.analytics,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt
    };
  }

  async #filterDocumentsByPermissions(documents, user) {
    return documents.filter(doc => {
      return doc.tenantId?.toString() === user.tenantId?.toString() ||
             user.role === 'admin';
    });
  }

  async #validateShareData(shareData) {
    const errors = [];

    if (!shareData.type) {
      errors.push('Share type is required');
    } else if (!['internal', 'external', 'public_link'].includes(shareData.type)) {
      errors.push('Invalid share type');
    }

    if (shareData.type === 'external' && !shareData.recipientEmail) {
      errors.push('Recipient email is required for external shares');
    }

    if (!shareData.permissions || !Array.isArray(shareData.permissions)) {
      errors.push('Permissions array is required');
    }

    if (errors.length > 0) {
      throw new ValidationError(errors.join('; '), 'SHARE_DATA_VALIDATION');
    }

    return true;
  }

  async #getDocumentAnalyticsData(documentId) {
    try {
      return {
        views: 0,
        downloads: 0,
        shares: 0,
        lastAccessed: null
      };
    } catch (error) {
      logger.error('Error getting document analytics:', error);
      return null;
    }
  }

  async #getRelatedDocuments(documentId) {
    try {
      return [];
    } catch (error) {
      logger.error('Error getting related documents:', error);
      return [];
    }
  }

  async #updateClientDocumentCount(clientId, increment = 1) {
    try {
      logger.debug(`Updating document count for client ${clientId} by ${increment}`);
    } catch (error) {
      logger.error('Error updating client document count:', error);
    }
  }

  async #getClientStorageStats(clientId) {
    try {
      return {
        totalDocuments: 0,
        totalSize: 0,
        storageUsed: 0,
        storageLimit: 1000000000 // 1GB default
      };
    } catch (error) {
      logger.error('Error getting storage stats:', error);
      return null;
    }
  }

  async #generateDocumentInsights(analytics, options) {
    const insights = [];

    if (analytics.storage?.used > analytics.storage?.limit * 0.8) {
      insights.push({
        type: 'warning',
        message: 'Storage usage is approaching limit',
        recommendation: 'Consider archiving old documents or increasing storage limit'
      });
    }

    if (analytics.overview?.totalViews === 0) {
      insights.push({
        type: 'info',
        message: 'No document views recorded',
        recommendation: 'Ensure documents are accessible and properly shared'
      });
    }

    return insights;
  }

  async #logControllerAction(action, data) {
    try {
      logger.audit({
        category: 'CLIENT_DOCUMENTS_CONTROLLER',
        action,
        timestamp: new Date(),
        data
      });
    } catch (error) {
      logger.error('Error logging controller action:', error);
    }
  }

  async #sendDocumentNotification(eventType, document, client, user) {
    try {
      logger.debug(`Sending ${eventType} notification for document ${document._id}`);
    } catch (error) {
      logger.error('Error sending document notification:', error);
    }
  }
}

// Validation middleware
const validateDocumentUpload = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Document name must be 1-255 characters'),

  body('type')
    .optional()
    .isIn(['contract', 'proposal', 'invoice', 'report', 'presentation', 'image', 'other'])
    .withMessage('Invalid document type'),

  body('classification.level')
    .optional()
    .isIn(['public', 'internal', 'confidential', 'restricted'])
    .withMessage('Invalid classification level')
];

const validateDocumentShare = [
  body('type')
    .isIn(['internal', 'external', 'public_link'])
    .withMessage('Invalid share type'),

  body('permissions')
    .isArray({ min: 1 })
    .withMessage('At least one permission must be specified'),

  body('permissions.*')
    .isIn(['read', 'write', 'delete', 'share'])
    .withMessage('Invalid permission')
];

const validateWorkflowStart = [
  body('workflowType')
    .isIn(['approval', 'review', 'signature'])
    .withMessage('Invalid workflow type'),

  body('assignees')
    .optional()
    .isObject()
    .withMessage('Assignees must be an object')
];

// Rate limiting middleware
const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many upload requests, please try again later'
});

const downloadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many download requests, please try again later'
});

// File upload middleware
const uploadConfig = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10 // Max 10 files for bulk upload
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// Export controller and middleware
module.exports = new ClientDocumentsController();