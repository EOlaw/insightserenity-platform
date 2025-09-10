'use strict';

/**
 * @fileoverview Enterprise client documents service with version control, compliance, and automated workflows
 * @module servers/customer-services/modules/core-business/clients/services/client-documents-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/file-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-model
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-document-model
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-note-model
 */

const mongoose = require('mongoose');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../../shared/lib/services/cache-service');
const EmailService = require('../../../../../../shared/lib/services/email-service');
const NotificationService = require('../../../../../../shared/lib/services/notification-service');
const FileService = require('../../../../../../shared/lib/services/file-service');
const AuditService = require('../../../../../../shared/lib/security/audit/audit-service');
const EncryptionService = require('../../../../../../shared/lib/security/encryption/encryption-service');
const ClientModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/clients/client-model');
const ClientDocumentModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/clients/client-document-model');
const ClientNoteModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/clients/client-note-model');
const path = require('path');
const crypto = require('crypto');
const moment = require('moment');
const mime = require('mime-types');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const _ = require('lodash');

/**
 * Client documents service for comprehensive document management and compliance
 * @class ClientDocumentsService
 * @description Manages document lifecycle, versioning, access control, and compliance
 */
class ClientDocumentsService {
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
     * @type {FileService}
     */
    #fileService;

    /**
     * @private
     * @type {AuditService}
     */
    #auditService;

    /**
     * @private
     * @type {EncryptionService}
     */
    #encryptionService;

    /**
     * @private
     * @type {number}
     */
    #defaultCacheTTL = 3600;

    /**
     * @private
     * @type {number}
     */
    #maxFileSize = 100 * 1024 * 1024; // 100MB

    /**
     * @private
     * @type {number}
     */
    #maxBulkOperationSize = 100;

    /**
     * @private
     * @type {Object}
     */
    #storageProviders = {
        aws_s3: { enabled: true, default: true },
        azure_blob: { enabled: true },
        gcp_storage: { enabled: true },
        local: { enabled: false } // Disabled in production
    };

    /**
     * @private
     * @type {Object}
     */
    #allowedFileTypes = {
        documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.odt'],
        images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'],
        videos: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'],
        archives: ['.zip', '.rar', '.7z', '.tar', '.gz']
    };

    /**
     * @private
     * @type {Object}
     */
    #documentWorkflows = {
        approval: {
            steps: ['draft', 'review', 'approval', 'published'],
            notifications: true,
            autoProgress: false
        },
        signature: {
            steps: ['prepared', 'sent', 'signed', 'completed'],
            notifications: true,
            autoProgress: true
        }
    };

    /**
     * @private
     * @type {Object}
     */
    #complianceSettings = {
        retentionPolicies: {
            contracts: { years: 7, permanent: false },
            financial: { years: 7, permanent: false },
            legal: { years: 10, permanent: true },
            general: { years: 3, permanent: false }
        },
        encryptionRequired: ['financial', 'legal', 'confidential'],
        auditRequired: ['contracts', 'financial', 'legal'],
        gdprCompliant: true
    };

    /**
     * @private
     * @type {Map}
     */
    #activeUploads = new Map();

    /**
     * @private
     * @type {Map}
     */
    #documentLocks = new Map();

    /**
     * Creates an instance of ClientDocumentsService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#fileService = dependencies.fileService || new FileService();
        this.#auditService = dependencies.auditService || new AuditService();
        this.#encryptionService = dependencies.encryptionService || new EncryptionService();

        this.#initializeService();
    }

    /**
     * Initialize service components
     * @private
     */
    #initializeService() {
        logger.info('Initializing ClientDocumentsService', {
            storageProviders: Object.keys(this.#storageProviders).filter(p => this.#storageProviders[p].enabled),
            maxFileSize: this.#maxFileSize,
            complianceSettings: this.#complianceSettings
        });
    }

    // ==================== Document Upload & Creation ====================

    /**
     * Upload a document for a client
     * @param {string} clientId - Client ID
     * @param {Object} fileData - File data and metadata
     * @param {string} userId - User uploading document
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Uploaded document
     * @throws {ValidationError} If validation fails
     */
    async uploadDocument(clientId, fileData, userId, options = {}) {
        const uploadId = crypto.randomBytes(16).toString('hex');
        const session = options.session || null;

        try {
            // Register upload
            this.#activeUploads.set(uploadId, {
                startTime: Date.now(),
                clientId,
                userId,
                fileName: fileData.originalName
            });

            // Validate client
            const client = await ClientModel.findById(clientId);
            if (!client) {
                throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
            }

            // Validate file
            await this.#validateFile(fileData);

            // Check permissions
            await this.#checkDocumentPermissions(client, userId, 'create');

            // Scan for viruses/malware
            await this.#scanFile(fileData.buffer);

            // Process file based on type
            const processedFile = await this.#processFile(fileData);

            // Determine storage provider
            const storageProvider = options.storageProvider || this.#getDefaultStorageProvider();

            // Upload to storage
            const storageResult = await this.#uploadToStorage(
                processedFile,
                storageProvider,
                {
                    clientId,
                    encrypt: this.#shouldEncrypt(fileData.classification)
                }
            );

            // Create document record
            const documentData = {
                clientId,
                tenantId: client.tenantId,
                organizationId: client.organizationId,
                documentInfo: {
                    name: fileData.name || fileData.originalName,
                    description: fileData.description,
                    type: fileData.type || 'other',
                    category: fileData.category || { primary: 'general' },
                    classification: fileData.classification || { level: 'internal' },
                    keywords: fileData.keywords || []
                },
                fileDetails: {
                    originalName: fileData.originalName,
                    fileName: storageResult.fileName,
                    fileExtension: path.extname(fileData.originalName).toLowerCase(),
                    mimeType: fileData.mimeType,
                    size: fileData.size,
                    checksum: processedFile.checksum
                },
                storage: {
                    provider: storageProvider,
                    location: storageResult.location,
                    url: storageResult.url,
                    encryption: {
                        enabled: storageResult.encrypted || false,
                        algorithm: storageResult.encryptionAlgorithm
                    }
                },
                accessControl: {
                    owner: userId,
                    permissions: fileData.permissions || {}
                },
                metadata: {
                    uploadedBy: userId,
                    source: 'upload'
                }
            };

            // Add to project/engagement if specified
            if (options.projectId) {
                documentData.projectId = options.projectId;
            }
            if (options.engagementId) {
                documentData.engagementId = options.engagementId;
            }

            // Create document
            const document = await ClientDocumentModel.create([documentData], { session });

            // Generate thumbnails for images
            if (this.#isImage(fileData.mimeType)) {
                await this.#generateThumbnails(document[0], processedFile.buffer);
            }

            // Extract text for searchability
            if (this.#isTextExtractable(fileData.mimeType)) {
                await this.#extractText(document[0]);
            }

            // Create upload note
            await this.#createDocumentNote(document[0], 'uploaded', userId);

            // Send notifications
            await this.#sendUploadNotifications(document[0], client, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_UPLOADED',
                entityType: 'client_document',
                entityId: document[0]._id,
                userId,
                details: {
                    documentId: document[0].documentId,
                    fileName: fileData.originalName,
                    clientId,
                    size: fileData.size
                }
            });

            // Clear caches
            await this.#clearDocumentCaches(client.tenantId, clientId);

            logger.info('Document uploaded successfully', {
                documentId: document[0]._id,
                clientId,
                uploadedBy: userId
            });

            return document[0];
        } catch (error) {
            logger.error('Error uploading document', {
                error: error.message,
                clientId,
                fileName: fileData.originalName,
                userId
            });
            throw error;
        } finally {
            this.#activeUploads.delete(uploadId);
        }
    }

    /**
     * Create a new version of a document
     * @param {string} documentId - Document ID
     * @param {Object} fileData - New version file data
     * @param {string} userId - User creating version
     * @param {Object} options - Version options
     * @returns {Promise<Object>} New document version
     */
    async createDocumentVersion(documentId, fileData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Get existing document
            const existingDocument = await ClientDocumentModel.findById(documentId);
            if (!existingDocument) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(existingDocument, userId, 'write');

            // Check if document is locked
            if (this.#isDocumentLocked(documentId)) {
                throw new ForbiddenError('Document is locked for editing', 'DOCUMENT_LOCKED');
            }

            // Validate new file
            await this.#validateFile(fileData);

            // Upload new version
            const uploadedFile = await this.uploadDocument(
                existingDocument.clientId,
                fileData,
                userId,
                { ...options, session }
            );

            // Create version link
            const newVersion = await existingDocument.createVersion(
                uploadedFile.fileDetails,
                userId,
                options.changeNotes
            );

            // Update relationships
            newVersion.relationships.relatedDocuments.push({
                documentId: existingDocument._id,
                relationship: 'supersedes'
            });
            await newVersion.save();

            // Send version notifications
            await this.#sendVersionNotifications(newVersion, existingDocument, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_VERSION_CREATED',
                entityType: 'client_document',
                entityId: newVersion._id,
                userId,
                details: {
                    originalDocumentId: documentId,
                    newVersion: newVersion.versioning.versionString,
                    changeNotes: options.changeNotes
                }
            });

            return newVersion;
        } catch (error) {
            logger.error('Error creating document version', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    // ==================== Document Access & Retrieval ====================

    /**
     * Get document by ID with access control
     * @param {string} documentId - Document ID
     * @param {string} userId - User requesting document
     * @param {Object} options - Retrieval options
     * @returns {Promise<Object>} Document object
     * @throws {NotFoundError} If document not found
     * @throws {ForbiddenError} If access denied
     */
    async getDocumentById(documentId, userId, options = {}) {
        const {
            includeContent = false,
            includeVersions = false,
            checkPermissions = true
        } = options;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('document', documentId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached && !includeContent) return cached;

            // Get document
            const document = await ClientDocumentModel.findById(documentId)
                .populate('clientId', 'companyName clientCode')
                .populate('metadata.uploadedBy', 'profile.firstName profile.lastName email');

            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            if (checkPermissions) {
                await this.#checkDocumentAccess(document, userId, 'read');
            }

            // Record view
            await document.recordView(userId);

            // Include content if requested
            let content = null;
            if (includeContent) {
                content = await this.#getDocumentContent(document);
            }

            // Include version history if requested
            let versions = [];
            if (includeVersions) {
                versions = await this.#getDocumentVersions(document);
            }

            const result = {
                ...document.toObject(),
                content,
                versions,
                downloadUrl: await this.#generateDownloadUrl(document, userId)
            };

            // Cache result (without content)
            if (!includeContent) {
                await this.#cacheService.set(cacheKey, result, this.#defaultCacheTTL);
            }

            return result;
        } catch (error) {
            logger.error('Error getting document', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Download document
     * @param {string} documentId - Document ID
     * @param {string} userId - User downloading document
     * @param {Object} options - Download options
     * @returns {Promise<Object>} Download stream and metadata
     */
    async downloadDocument(documentId, userId, options = {}) {
        const { format, watermark = false } = options;

        try {
            // Get document
            const document = await this.getDocumentById(documentId, userId, {
                checkPermissions: true
            });

            // Check download restrictions
            if (document.accessControl.restrictions?.downloadDisabled) {
                throw new ForbiddenError('Downloads are disabled for this document', 'DOWNLOAD_DISABLED');
            }

            // Check download limit
            if (document.accessControl.restrictions?.viewLimit &&
                document.accessControl.restrictions.viewCount >= document.accessControl.restrictions.viewLimit) {
                throw new ForbiddenError('Download limit exceeded', 'DOWNLOAD_LIMIT_EXCEEDED');
            }

            // Get file from storage
            const fileBuffer = await this.#downloadFromStorage(document);

            // Apply watermark if requested
            let processedBuffer = fileBuffer;
            if (watermark || document.accessControl.restrictions?.watermark?.enabled) {
                processedBuffer = await this.#applyWatermark(fileBuffer, document, userId);
            }

            // Convert format if requested
            if (format && format !== document.fileDetails.fileExtension) {
                processedBuffer = await this.#convertDocument(processedBuffer, document, format);
            }

            // Record download
            await document.recordDownload(userId, format || document.fileDetails.fileExtension);

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_DOWNLOADED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: {
                    documentName: document.documentInfo.name,
                    format: format || document.fileDetails.fileExtension
                }
            });

            return {
                buffer: processedBuffer,
                metadata: {
                    fileName: document.documentInfo.name,
                    mimeType: document.fileDetails.mimeType,
                    size: processedBuffer.length,
                    originalSize: document.fileDetails.size
                }
            };
        } catch (error) {
            logger.error('Error downloading document', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    // ==================== Document Sharing & Permissions ====================

    /**
     * Share document with users or external parties
     * @param {string} documentId - Document ID
     * @param {Object} shareData - Sharing configuration
     * @param {string} userId - User sharing document
     * @returns {Promise<Object>} Share result
     */
    async shareDocument(documentId, shareData, userId) {
        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'share');

            // Validate share data
            await this.#validateShareData(shareData);

            // Create share
            const share = await document.shareDocument(shareData, userId);

            // Generate share link if public
            if (shareData.type === 'public_link') {
                const shareLink = await this.#generatePublicShareLink(document, shareData);
                share.publicUrl = shareLink.url;
                share.shortUrl = shareLink.shortUrl;
            }

            // Send share notifications
            await this.#sendShareNotifications(document, shareData, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_SHARED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: {
                    shareType: shareData.type,
                    recipient: shareData.recipientEmail || shareData.recipientId,
                    permissions: shareData.permissions
                }
            });

            return share;
        } catch (error) {
            logger.error('Error sharing document', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Update document permissions
     * @param {string} documentId - Document ID
     * @param {Object} permissions - New permissions configuration
     * @param {string} userId - User updating permissions
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated permissions
     */
    async updateDocumentPermissions(documentId, permissions, userId, options = {}) {
        const { notifyAffectedUsers = true, reason, effectiveDate = new Date() } = options;

        try {
            // Get existing document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check if user has admin permissions on this document
            await this.#checkDocumentAccess(document, userId, 'admin');

            // Store original permissions for comparison
            const originalPermissions = document.accessControl.permissions;

            // Validate and sanitize new permissions
            const validatedPermissions = await this.#validateAndSanitizePermissions(permissions, document);

            // Build the updated permissions object
            const updatedPermissions = {
                users: validatedPermissions.users || [],
                groups: validatedPermissions.groups || [],
                roles: validatedPermissions.roles || [],
                public: validatedPermissions.public || null,
                restrictions: {
                    ...document.accessControl.restrictions,
                    ...validatedPermissions.restrictions
                },
                inheritance: validatedPermissions.inheritance || { enabled: false },
                lastUpdated: effectiveDate,
                lastUpdatedBy: userId,
                updateReason: reason
            };

            // Ensure document owner retains admin access
            const ownerHasAdmin = updatedPermissions.users.some(
                user => user.userId.toString() === document.accessControl.owner.toString() &&
                    user.permissions.admin === true
            );

            if (!ownerHasAdmin) {
                // Add owner with admin permissions
                updatedPermissions.users = updatedPermissions.users.filter(
                    user => user.userId.toString() !== document.accessControl.owner.toString()
                );

                updatedPermissions.users.push({
                    userId: document.accessControl.owner,
                    permissions: {
                        read: true,
                        write: true,
                        delete: true,
                        share: true,
                        admin: true
                    },
                    grantedBy: userId,
                    grantedAt: effectiveDate,
                    notes: 'Document owner - automatic admin access'
                });
            }

            // Update document with new permissions
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'accessControl.permissions': updatedPermissions,
                        'metadata.lastModifiedBy': userId,
                        'metadata.lastModifiedAt': effectiveDate
                    }
                },
                { new: true }
            );

            // Identify affected users for notifications
            const affectedUsers = await this.#identifyAffectedUsers(originalPermissions, updatedPermissions);

            // Send notifications to affected users
            if (notifyAffectedUsers && affectedUsers.length > 0) {
                await this.#sendPermissionChangeNotifications(
                    document,
                    affectedUsers,
                    userId,
                    reason
                );
            }

            // Log detailed audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_PERMISSIONS_UPDATED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: {
                    reason,
                    effectiveDate,
                    changesApplied: await this.#calculatePermissionChanges(originalPermissions, updatedPermissions),
                    affectedUserCount: affectedUsers.length,
                    documentName: document.documentInfo.name,
                    clientId: document.clientId
                }
            });

            // Clear relevant caches
            await this.#clearDocumentCaches(document.tenantId, document.clientId);

            // Clear user-specific permission caches
            for (const user of updatedPermissions.users) {
                await this.#cacheService.delete(`user-document-permissions:${user.userId}:${documentId}`);
            }

            logger.info('Document permissions updated successfully', {
                documentId,
                updatedBy: userId,
                affectedUsers: affectedUsers.length,
                reason
            });

            return updatedDocument.accessControl.permissions;

        } catch (error) {
            logger.error('Error updating document permissions', {
                error: error.message,
                documentId,
                userId,
                permissions
            });
            throw error;
        }
    }

    /**
     * Update document permissions
     * @param {string} documentId - Document ID
     * @param {Object} permissions - Permission updates
     * @param {string} userId - User updating permissions
     * @returns {Promise<Object>} Updated permissions
     */
    async updateDocumentPermissions(documentId, permissions, userId) {
        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check if user has admin permissions
            await this.#checkDocumentAccess(document, userId, 'admin');

            // Validate permissions
            await this.#validatePermissions(permissions);

            // Update permissions
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'accessControl.permissions': permissions
                    }
                },
                { new: true }
            );

            // Notify affected users
            await this.#notifyPermissionChanges(document, permissions, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_PERMISSIONS_UPDATED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: {
                    permissions
                }
            });

            return updatedDocument.accessControl.permissions;
        } catch (error) {
            logger.error('Error updating document permissions', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    // ==================== Document Workflows ====================

    /**
     * Start document workflow
     * @param {string} documentId - Document ID
     * @param {string} workflowType - Type of workflow
     * @param {Object} workflowData - Workflow configuration
     * @param {string} userId - User starting workflow
     * @returns {Promise<Object>} Workflow instance
     */
    async startDocumentWorkflow(documentId, workflowType, workflowData, userId) {
        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Validate workflow
            if (!this.#documentWorkflows[workflowType]) {
                throw new ValidationError(`Unknown workflow type: ${workflowType}`, 'INVALID_WORKFLOW');
            }

            const workflow = this.#documentWorkflows[workflowType];

            // Initialize workflow on document
            const workflowInstance = {
                type: workflowType,
                templateId: workflowData.templateId,
                currentStep: workflow.steps[0],
                steps: workflow.steps.map(step => ({
                    name: step,
                    type: workflowData.stepTypes?.[step] || 'review',
                    assignee: workflowData.assignees?.[step],
                    status: step === workflow.steps[0] ? 'in_progress' : 'pending'
                })),
                startedBy: userId,
                startedAt: new Date()
            };

            // Update document
            await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'lifecycle.workflow': workflowInstance,
                        'lifecycle.status': 'review'
                    }
                }
            );

            // Send workflow notifications
            if (workflow.notifications) {
                await this.#sendWorkflowNotifications(document, workflowInstance, 'started');
            }

            // Start first step
            await this.#executeWorkflowStep(document, workflowInstance.steps[0]);

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_WORKFLOW_STARTED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: {
                    workflowType,
                    steps: workflow.steps
                }
            });

            return workflowInstance;
        } catch (error) {
            logger.error('Error starting document workflow', {
                error: error.message,
                documentId,
                workflowType,
                userId
            });
            throw error;
        }
    }

    /**
     * Request document signatures
     * @param {string} documentId - Document ID
     * @param {Array} signatories - List of signatories
     * @param {Object} options - Signature options
     * @param {string} userId - User requesting signatures
     * @returns {Promise<Object>} Signature request result
     */
    async requestDocumentSignatures(documentId, signatories, options = {}, userId) {
        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Validate signatories
            await this.#validateSignatories(signatories);

            // Create signature request
            await document.requestSignature(signatories, options);

            // Send signature invitations
            for (const signatory of signatories) {
                await this.#sendSignatureInvitation(document, signatory, userId);
            }

            // Start signature workflow
            await this.startDocumentWorkflow(documentId, 'signature', {
                assignees: signatories.reduce((acc, s) => {
                    acc[`signatory_${s.order}`] = s.email;
                    return acc;
                }, {})
            }, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_SIGNATURES_REQUESTED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: {
                    signatories: signatories.map(s => ({ name: s.name, email: s.email }))
                }
            });

            return {
                documentId,
                signatories: document.signatures.signatories,
                status: 'pending',
                requestedAt: new Date()
            };
        } catch (error) {
            logger.error('Error requesting document signatures', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    // ==================== Compliance & Retention ====================

    /**
     * Apply retention policy to document
     * @param {string} documentId - Document ID
     * @param {string} policyType - Retention policy type
     * @param {string} userId - User applying policy
     * @returns {Promise<Object>} Applied policy
     */
    async applyRetentionPolicy(documentId, policyType, userId) {
        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'admin');

            // Get retention policy
            const policy = this.#complianceSettings.retentionPolicies[policyType];
            if (!policy) {
                throw new ValidationError(`Unknown retention policy: ${policyType}`, 'INVALID_POLICY');
            }

            // Calculate retention date
            const retentionDate = policy.permanent ?
                null :
                moment().add(policy.years, 'years').toDate();

            // Update document
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'lifecycle.retention': {
                            policy: policyType,
                            retentionPeriod: {
                                value: policy.years,
                                unit: 'years'
                            },
                            retentionDate,
                            dispositionDate: retentionDate
                        }
                    }
                },
                { new: true }
            );

            // Schedule retention actions
            if (retentionDate) {
                await this.#scheduleRetentionAction(document, retentionDate);
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'RETENTION_POLICY_APPLIED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: {
                    policyType,
                    retentionYears: policy.years,
                    permanent: policy.permanent
                }
            });

            return updatedDocument.lifecycle.retention;
        } catch (error) {
            logger.error('Error applying retention policy', {
                error: error.message,
                documentId,
                policyType,
                userId
            });
            throw error;
        }
    }

    /**
     * Check document compliance
     * @param {string} documentId - Document ID
     * @param {Array} regulations - Regulations to check
     * @returns {Promise<Object>} Compliance status
     */
    async checkDocumentCompliance(documentId, regulations = []) {
        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            const complianceResults = {
                documentId,
                overallCompliant: true,
                results: [],
                recommendations: []
            };

            // Check each regulation
            for (const regulation of regulations) {
                const result = await this.#checkRegulationCompliance(document, regulation);
                complianceResults.results.push(result);

                if (!result.compliant) {
                    complianceResults.overallCompliant = false;
                    complianceResults.recommendations.push(...result.recommendations);
                }
            }

            // Check encryption requirements
            const encryptionRequired = this.#shouldEncrypt(document.documentInfo.classification.level);
            if (encryptionRequired && !document.storage.encryption.enabled) {
                complianceResults.overallCompliant = false;
                complianceResults.recommendations.push('Enable encryption for this document classification');
            }

            // Check audit requirements
            if (this.#complianceSettings.auditRequired.includes(document.documentInfo.type)) {
                if (!document.compliance.audit.required) {
                    complianceResults.recommendations.push('Enable audit logging for this document type');
                }
            }

            // Update document compliance status
            await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'compliance.regulatory.compliant': complianceResults.overallCompliant,
                        'compliance.regulatory.lastReview': new Date()
                    }
                }
            );

            return complianceResults;
        } catch (error) {
            logger.error('Error checking document compliance', {
                error: error.message,
                documentId,
                regulations
            });
            throw error;
        }
    }

    // ==================== Search & Analytics ====================

    /**
     * Search documents with advanced filtering
     * @param {Object} searchCriteria - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async searchDocuments(searchCriteria, options = {}) {
        const {
            page = 1,
            limit = 20,
            sort = { createdAt: -1 },
            tenantId
        } = options;

        try {
            const searchResults = await ClientDocumentModel.searchDocuments(
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

            // Enrich results
            const enrichedDocuments = await Promise.all(
                searchResults.documents.map(async doc => ({
                    ...doc.toObject(),
                    canDownload: await this.#canDownload(doc, options.userId),
                    thumbnailUrl: await this.#getThumbnailUrl(doc)
                }))
            );

            return {
                documents: enrichedDocuments,
                pagination: {
                    total: searchResults.total,
                    page,
                    limit,
                    totalPages: Math.ceil(searchResults.total / limit),
                    hasMore: searchResults.hasMore
                },
                facets: await this.#generateSearchFacets(searchCriteria, tenantId)
            };
        } catch (error) {
            logger.error('Error searching documents', {
                error: error.message,
                searchCriteria
            });
            throw error;
        }
    }

    /**
     * Get document analytics
     * @param {string} clientId - Client ID (optional)
     * @param {Object} options - Analytics options
     * @returns {Promise<Object>} Document analytics
     */
    async getDocumentAnalytics(clientId = null, options = {}) {
        const {
            dateRange = { start: moment().subtract(90, 'days').toDate(), end: new Date() },
            tenantId
        } = options;

        try {
            const query = {
                isDeleted: false,
                createdAt: { $gte: dateRange.start, $lte: dateRange.end }
            };

            if (clientId) query.clientId = clientId;
            if (tenantId) query.tenantId = tenantId;

            const analytics = await ClientDocumentModel.aggregate([
                { $match: query },
                {
                    $facet: {
                        overview: [
                            {
                                $group: {
                                    _id: null,
                                    totalDocuments: { $sum: 1 },
                                    totalSize: { $sum: '$fileDetails.size' },
                                    avgSize: { $avg: '$fileDetails.size' },
                                    totalViews: { $sum: '$analytics.views.total' },
                                    totalDownloads: { $sum: '$analytics.downloads.total' },
                                    totalShares: { $sum: '$analytics.shares.total' }
                                }
                            }
                        ],
                        byType: [
                            {
                                $group: {
                                    _id: '$documentInfo.type',
                                    count: { $sum: 1 },
                                    totalSize: { $sum: '$fileDetails.size' }
                                }
                            },
                            { $sort: { count: -1 } }
                        ],
                        byClassification: [
                            {
                                $group: {
                                    _id: '$documentInfo.classification.level',
                                    count: { $sum: 1 },
                                    totalSize: { $sum: '$fileDetails.size' }
                                }
                            }
                        ],
                        timeline: [
                            {
                                $group: {
                                    _id: {
                                        year: { $year: '$createdAt' },
                                        month: { $month: '$createdAt' }
                                    },
                                    count: { $sum: 1 },
                                    size: { $sum: '$fileDetails.size' }
                                }
                            },
                            { $sort: { '_id.year': 1, '_id.month': 1 } }
                        ],
                        topDocuments: [
                            { $sort: { 'analytics.views.total': -1 } },
                            { $limit: 10 },
                            {
                                $project: {
                                    documentId: 1,
                                    name: '$documentInfo.name',
                                    views: '$analytics.views.total',
                                    downloads: '$analytics.downloads.total'
                                }
                            }
                        ]
                    }
                }
            ]);

            const result = analytics[0];

            return {
                overview: result.overview[0] || {
                    totalDocuments: 0,
                    totalSize: 0,
                    avgSize: 0,
                    totalViews: 0,
                    totalDownloads: 0,
                    totalShares: 0
                },
                distribution: {
                    byType: result.byType,
                    byClassification: result.byClassification
                },
                timeline: result.timeline,
                topDocuments: result.topDocuments,
                dateRange,
                storage: {
                    used: result.overview[0]?.totalSize || 0,
                    limit: 1000000000000, // 1TB default
                    percentage: ((result.overview[0]?.totalSize || 0) / 1000000000000) * 100
                }
            };
        } catch (error) {
            logger.error('Error getting document analytics', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    // ==================== Bulk Operations ====================

    /**
     * Bulk upload documents
     * @param {string} clientId - Client ID
     * @param {Array} files - Array of file data
     * @param {string} userId - User uploading documents
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Bulk upload results
     */
    async bulkUploadDocuments(clientId, files, userId, options = {}) {
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            const results = {
                successful: [],
                failed: [],
                total: files.length
            };

            // Validate bulk size
            if (files.length > this.#maxBulkOperationSize) {
                throw new ValidationError(
                    `Bulk operation size exceeds maximum of ${this.#maxBulkOperationSize}`,
                    'BULK_SIZE_EXCEEDED'
                );
            }

            // Process each file
            for (const [index, file] of files.entries()) {
                try {
                    const document = await this.uploadDocument(
                        clientId,
                        file,
                        userId,
                        { ...options, session }
                    );

                    results.successful.push({
                        index,
                        documentId: document._id,
                        documentName: document.documentInfo.name
                    });
                } catch (error) {
                    results.failed.push({
                        index,
                        fileName: file.originalName,
                        error: error.message
                    });
                }
            }

            await session.commitTransaction();

            // Log audit trail
            await this.#auditService.log({
                action: 'BULK_DOCUMENTS_UPLOADED',
                entityType: 'client_document',
                userId,
                details: {
                    clientId,
                    total: results.total,
                    successful: results.successful.length,
                    failed: results.failed.length
                }
            });

            return results;
        } catch (error) {
            await session.abortTransaction();
            logger.error('Error in bulk document upload', {
                error: error.message,
                clientId,
                userId
            });
            throw error;
        } finally {
            session.endSession();
        }
    }

    // ==================== Private Helper Methods ====================

    /**
     * Validate file
     * @private
     */
    async #validateFile(fileData) {
        const errors = [];

        // Check file size
        if (fileData.size > this.#maxFileSize) {
            errors.push(`File size exceeds maximum of ${this.#maxFileSize / 1024 / 1024}MB`);
        }

        // Check file type
        const extension = path.extname(fileData.originalName).toLowerCase();
        const allowedExtensions = Object.values(this.#allowedFileTypes).flat();

        if (!allowedExtensions.includes(extension)) {
            errors.push(`File type ${extension} is not allowed`);
        }

        // Check file name
        if (!fileData.originalName || fileData.originalName.length > 255) {
            errors.push('Invalid file name');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'FILE_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Scan file for viruses/malware
     * @private
     */
    async #scanFile(buffer) {
        // Implement virus scanning logic
        // This would integrate with your antivirus service
        return true;
    }

    /**
     * Process file based on type
     * @private
     */
    async #processFile(fileData) {
        const processed = {
            buffer: fileData.buffer,
            checksum: {
                md5: crypto.createHash('md5').update(fileData.buffer).digest('hex'),
                sha256: crypto.createHash('sha256').update(fileData.buffer).digest('hex')
            }
        };

        // Compress if beneficial
        if (fileData.size > 1024 * 1024 && !this.#isCompressed(fileData.mimeType)) {
            // Implement compression logic
        }

        return processed;
    }

    /**
     * Upload file to storage provider
     * @private
     */
    async #uploadToStorage(file, provider, options = {}) {
        const fileName = `${options.clientId}/${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

        // Encrypt if required
        let uploadBuffer = file.buffer;
        if (options.encrypt) {
            uploadBuffer = await this.#encryptionService.encrypt(uploadBuffer);
        }

        // Upload to provider
        const result = await this.#fileService.upload(uploadBuffer, {
            provider,
            fileName,
            ...options
        });

        return {
            fileName,
            location: result.location,
            url: result.url,
            encrypted: options.encrypt
        };
    }

    /**
     * Check if document should be encrypted
     * @private
     */
    #shouldEncrypt(classification) {
        return this.#complianceSettings.encryptionRequired.includes(
            classification?.level || classification
        );
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
        return `document:${type}:${identifier}:${optionsHash}`;
    }

    /**
     * Clear document caches
     * @private
     */
    async #clearDocumentCaches(tenantId, clientId = null) {
        const patterns = [`document:*:${tenantId}:*`];
        if (clientId) {
            patterns.push(`document:*:${clientId}:*`);
        }

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }

    /**
     * Check document access permissions
     * @private
     */
    async #checkDocumentAccess(document, userId, action) {
        // Implement comprehensive permission checking
        // Check ownership, group permissions, role permissions, etc.

        // Owner has full access
        if (document.accessControl.owner.toString() === userId) {
            return true;
        }

        // Check user permissions
        const userPermission = document.accessControl.permissions.users?.find(
            u => u.userId.toString() === userId
        );

        if (userPermission && userPermission.permissions[action]) {
            return true;
        }

        // Check if permission expired
        if (userPermission?.expiresAt && userPermission.expiresAt < new Date()) {
            throw new ForbiddenError('Access permission expired', 'PERMISSION_EXPIRED');
        }

        // If no permissions found, deny access
        throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
    }

    /**
     * Get default storage provider
     * @private
     */
    #getDefaultStorageProvider() {
        for (const [provider, config] of Object.entries(this.#storageProviders)) {
            if (config.enabled && config.default) {
                return provider;
            }
        }
        return 'aws_s3';
    }

    /**
     * Check if file is an image
     * @private
     */
    #isImage(mimeType) {
        return mimeType && mimeType.startsWith('image/');
    }

    /**
     * Check if document is locked
     * @private
     */
    #isDocumentLocked(documentId) {
        const lock = this.#documentLocks.get(documentId);
        return lock && lock.expiresAt > new Date();
    }

    /**
     * Generate download URL
     * @private
     */
    async #generateDownloadUrl(document, userId) {
        // Generate signed URL with expiration
        const expiresIn = 3600; // 1 hour
        const token = crypto.randomBytes(32).toString('hex');

        const url = await this.#fileService.generateSignedUrl(document.storage.url, {
            expiresIn,
            userId,
            documentId: document._id
        });

        return url;
    }

    /**
     * Send upload notifications
     * @private
     */
    async #sendUploadNotifications(document, client, userId) {
        await this.#notificationService.send({
            type: 'document_uploaded',
            recipients: [client.relationship.accountManager],
            data: {
                documentName: document.documentInfo.name,
                clientName: client.companyName,
                uploadedBy: userId
            }
        });
    }

    /**
     * Check document creation permissions
     * @private
     * @param {Object} client - Client object
     * @param {string} userId - User ID
     * @param {string} action - Action to check
     */
    async #checkDocumentPermissions(client, userId, action) {
        try {
            // Check if user has client access
            if (client.relationship?.accountManager?.toString() === userId) {
                return true;
            }

            // Check user roles and permissions
            // In production, integrate with your permission system
            const hasPermission = await this.#hasClientPermission(userId, client._id, action);

            if (!hasPermission) {
                throw new ForbiddenError(
                    `Insufficient permissions for ${action} on client documents`,
                    'INSUFFICIENT_PERMISSIONS'
                );
            }

            return true;
        } catch (error) {
            logger.error('Error checking document permissions', {
                error: error.message,
                clientId: client._id,
                userId,
                action
            });
            throw error;
        }
    }

    /**
     * Generate thumbnails for image documents
     * @private
     * @param {Object} document - Document object
     * @param {Buffer} imageBuffer - Original image buffer
     */
    async #generateThumbnails(document, imageBuffer) {
        try {
            const thumbnailSizes = [
                { name: 'small', width: 150, height: 150 },
                { name: 'medium', width: 300, height: 300 },
                { name: 'large', width: 600, height: 600 }
            ];

            const thumbnails = {};

            for (const size of thumbnailSizes) {
                try {
                    const thumbnail = await sharp(imageBuffer)
                        .resize(size.width, size.height, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: 85 })
                        .toBuffer();

                    const thumbnailFileName = `${document._id}_${size.name}.jpg`;

                    const uploadResult = await this.#uploadToStorage(
                        { buffer: thumbnail, checksum: {} },
                        this.#getDefaultStorageProvider(),
                        {
                            clientId: document.clientId,
                            fileName: `thumbnails/${thumbnailFileName}`,
                            encrypt: false
                        }
                    );

                    thumbnails[size.name] = {
                        url: uploadResult.url,
                        width: size.width,
                        height: size.height,
                        size: thumbnail.length
                    };
                } catch (error) {
                    logger.warn('Error generating thumbnail', {
                        error: error.message,
                        documentId: document._id,
                        size: size.name
                    });
                }
            }

            // Update document with thumbnails
            await ClientDocumentModel.findByIdAndUpdate(
                document._id,
                {
                    $set: {
                        'processing.thumbnails': thumbnails,
                        'processing.thumbnailsGenerated': true
                    }
                }
            );

            logger.debug('Thumbnails generated successfully', {
                documentId: document._id,
                thumbnailCount: Object.keys(thumbnails).length
            });
        } catch (error) {
            logger.error('Error generating thumbnails', {
                error: error.message,
                documentId: document._id
            });
            // Don't throw - thumbnail generation is not critical
        }
    }

    /**
     * Extract text content from documents for search indexing
     * @private
     * @param {Object} document - Document object
     */
    async #extractText(document) {
        try {
            const fileBuffer = await this.#downloadFromStorage(document);
            let extractedText = '';

            switch (document.fileDetails.mimeType) {
                case 'application/pdf':
                    extractedText = await this.#extractTextFromPDF(fileBuffer);
                    break;
                case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                case 'application/msword':
                    extractedText = await this.#extractTextFromWord(fileBuffer);
                    break;
                case 'text/plain':
                    extractedText = fileBuffer.toString('utf-8');
                    break;
                default:
                    logger.debug('Text extraction not supported for this file type', {
                        documentId: document._id,
                        mimeType: document.fileDetails.mimeType
                    });
                    return;
            }

            // Clean and truncate text
            const cleanText = extractedText
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 50000); // Limit to 50KB

            // Update document with extracted text
            await ClientDocumentModel.findByIdAndUpdate(
                document._id,
                {
                    $set: {
                        'processing.textContent': cleanText,
                        'processing.textExtracted': true,
                        'searchTokens': this.#generateSearchTokens(cleanText)
                    }
                }
            );

            logger.debug('Text extracted successfully', {
                documentId: document._id,
                textLength: cleanText.length
            });
        } catch (error) {
            logger.error('Error extracting text', {
                error: error.message,
                documentId: document._id
            });
            // Don't throw - text extraction is not critical
        }
    }

    /**
     * Create document activity note
     * @private
     * @param {Object} document - Document object
     * @param {string} action - Action performed
     * @param {string} userId - User performing action
     */
    async #createDocumentNote(document, action, userId) {
        try {
            const noteContent = {
                uploaded: `Document "${document.documentInfo.name}" has been uploaded successfully.`,
                downloaded: `Document "${document.documentInfo.name}" was downloaded.`,
                shared: `Document "${document.documentInfo.name}" has been shared.`,
                workflow_started: `Workflow started for document "${document.documentInfo.name}".`,
                version_created: `New version created for document "${document.documentInfo.name}".`
            };

            await ClientNoteModel.create({
                clientId: document.clientId,
                tenantId: document.tenantId,
                organizationId: document.organizationId,
                content: {
                    title: `Document ${action.replace('_', ' ')}`,
                    body: noteContent[action] || `Action ${action} performed on document.`,
                    format: 'plain_text'
                },
                classification: {
                    type: 'document_management',
                    category: { primary: 'system' },
                    importance: 'low'
                },
                context: {
                    relatedTo: {
                        documents: [{
                            documentId: document._id,
                            documentName: document.documentInfo.name
                        }]
                    }
                },
                metadata: {
                    source: 'system_generated',
                    createdBy: userId
                }
            });

            logger.debug('Document note created', {
                documentId: document._id,
                action
            });
        } catch (error) {
            logger.error('Error creating document note', {
                error: error.message,
                documentId: document._id,
                action
            });
            // Don't throw - note creation is not critical
        }
    }

    /**
     * Send notifications about new document versions
     * @private
     * @param {Object} newVersion - New version document
     * @param {Object} originalDocument - Original document
     * @param {string} userId - User creating version
     */
    async #sendVersionNotifications(newVersion, originalDocument, userId) {
        try {
            const client = await ClientModel.findById(newVersion.clientId);

            // Notify document subscribers
            const subscribers = originalDocument.accessControl.permissions.users || [];

            for (const subscriber of subscribers) {
                if (subscriber.userId.toString() !== userId && subscriber.notifications?.versions) {
                    await this.#notificationService.send({
                        type: 'document_version_created',
                        recipient: subscriber.userId,
                        data: {
                            documentName: originalDocument.documentInfo.name,
                            clientName: client.companyName,
                            versionNumber: newVersion.versioning.versionString,
                            createdBy: userId
                        }
                    });
                }
            }

            // Notify account manager
            if (client.relationship?.accountManager &&
                client.relationship.accountManager.toString() !== userId) {
                await this.#notificationService.send({
                    type: 'client_document_version_created',
                    recipient: client.relationship.accountManager,
                    data: {
                        documentName: originalDocument.documentInfo.name,
                        clientName: client.companyName,
                        versionNumber: newVersion.versioning.versionString
                    }
                });
            }

            logger.debug('Version notifications sent', {
                documentId: newVersion._id,
                originalDocumentId: originalDocument._id,
                recipientCount: subscribers.length + 1
            });
        } catch (error) {
            logger.error('Error sending version notifications', {
                error: error.message,
                documentId: newVersion._id
            });
            // Don't throw - notifications are not critical
        }
    }

    /**
     * Get document content from storage
     * @private
     * @param {Object} document - Document object
     * @returns {Promise<Buffer>} Document content buffer
     */
    async #getDocumentContent(document) {
        try {
            // Check if content is cached
            const cacheKey = `document-content:${document._id}`;
            const cachedContent = await this.#cacheService.get(cacheKey);
            if (cachedContent) {
                return cachedContent;
            }

            // Download from storage
            const content = await this.#downloadFromStorage(document);

            // Cache content for small files (< 10MB)
            if (content.length < 10 * 1024 * 1024) {
                await this.#cacheService.set(cacheKey, content, 1800); // 30 minutes
            }

            return content;
        } catch (error) {
            logger.error('Error getting document content', {
                error: error.message,
                documentId: document._id
            });
            throw error;
        }
    }

    /**
     * Get document version history
     * @private
     * @param {Object} document - Document object
     * @returns {Promise<Array>} Version history
     */
    async #getDocumentVersions(document) {
        try {
            // Get all versions of this document
            const versions = await ClientDocumentModel.find({
                'versioning.originalId': document.versioning.originalId || document._id,
                isDeleted: false
            })
                .sort({ 'versioning.versionNumber': -1 })
                .select('versioning fileDetails.size createdAt metadata.uploadedBy documentInfo.name')
                .populate('metadata.uploadedBy', 'profile.firstName profile.lastName email');

            return versions.map(version => ({
                id: version._id,
                versionString: version.versioning.versionString,
                versionNumber: version.versioning.versionNumber,
                size: version.fileDetails.size,
                createdAt: version.createdAt,
                createdBy: version.metadata.uploadedBy,
                changeNotes: version.versioning.changeNotes,
                isCurrent: version._id.toString() === document._id.toString()
            }));
        } catch (error) {
            logger.error('Error getting document versions', {
                error: error.message,
                documentId: document._id
            });
            return [];
        }
    }

    /**
     * Download document from storage provider
     * @private
     * @param {Object} document - Document object
     * @returns {Promise<Buffer>} Document buffer
     */
    async #downloadFromStorage(document) {
        try {
            let fileBuffer = await this.#fileService.download(document.storage.location, {
                provider: document.storage.provider
            });

            // Decrypt if encrypted
            if (document.storage.encryption.enabled) {
                fileBuffer = await this.#encryptionService.decrypt(fileBuffer);
            }

            return fileBuffer;
        } catch (error) {
            logger.error('Error downloading from storage', {
                error: error.message,
                documentId: document._id,
                provider: document.storage.provider
            });
            throw new AppError(
                'Failed to download document from storage',
                'STORAGE_DOWNLOAD_FAILED'
            );
        }
    }

    /**
     * Apply watermark to document
     * @private
     * @param {Buffer} fileBuffer - Original file buffer
     * @param {Object} document - Document object
     * @param {string} userId - User downloading document
     * @returns {Promise<Buffer>} Watermarked document buffer
     */
    async #applyWatermark(fileBuffer, document, userId) {
        try {
            const watermarkText = document.accessControl.restrictions?.watermark?.text ||
                `Downloaded by ${userId} on ${new Date().toISOString()}`;

            if (document.fileDetails.mimeType === 'application/pdf') {
                return await this.#applyPDFWatermark(fileBuffer, watermarkText);
            } else if (this.#isImage(document.fileDetails.mimeType)) {
                return await this.#applyImageWatermark(fileBuffer, watermarkText);
            }

            // For other file types, return original
            return fileBuffer;
        } catch (error) {
            logger.error('Error applying watermark', {
                error: error.message,
                documentId: document._id
            });
            // Return original if watermarking fails
            return fileBuffer;
        }
    }

    /**
     * Convert document to different format
     * @private
     * @param {Buffer} buffer - Original document buffer
     * @param {Object} document - Document object
     * @param {string} targetFormat - Target format
     * @returns {Promise<Buffer>} Converted document buffer
     */
    async #convertDocument(buffer, document, targetFormat) {
        try {
            const sourceFormat = document.fileDetails.fileExtension;

            // Handle image conversions
            if (this.#isImage(document.fileDetails.mimeType) &&
                ['.jpg', '.jpeg', '.png', '.webp'].includes(targetFormat)) {
                return await sharp(buffer)
                    .toFormat(targetFormat.substring(1))
                    .toBuffer();
            }

            // Handle PDF conversions
            if (sourceFormat === '.pdf' && targetFormat === '.txt') {
                const text = await this.#extractTextFromPDF(buffer);
                return Buffer.from(text, 'utf-8');
            }

            // Add more conversions as needed
            throw new ValidationError(
                `Conversion from ${sourceFormat} to ${targetFormat} not supported`,
                'CONVERSION_NOT_SUPPORTED'
            );
        } catch (error) {
            logger.error('Error converting document', {
                error: error.message,
                documentId: document._id,
                targetFormat
            });
            throw error;
        }
    }

    /**
     * Validate document sharing data
     * @private
     * @param {Object} shareData - Sharing configuration
     */
    async #validateShareData(shareData) {
        const errors = [];

        if (!shareData.type) {
            errors.push('Share type is required');
        }

        const validTypes = ['user', 'external_email', 'public_link', 'group'];
        if (shareData.type && !validTypes.includes(shareData.type)) {
            errors.push(`Invalid share type. Must be one of: ${validTypes.join(', ')}`);
        }

        if (shareData.type === 'external_email' || shareData.type === 'user') {
            if (!shareData.recipientEmail && !shareData.recipientId) {
                errors.push('Recipient email or ID is required');
            }
        }

        if (shareData.recipientEmail) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(shareData.recipientEmail)) {
                errors.push('Invalid recipient email address');
            }
        }

        if (shareData.expiresAt && new Date(shareData.expiresAt) <= new Date()) {
            errors.push('Expiration date must be in the future');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'SHARE_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Generate public share link for document
     * @private
     * @param {Object} document - Document object
     * @param {Object} shareData - Share configuration
     * @returns {Promise<Object>} Share link information
     */
    async #generatePublicShareLink(document, shareData) {
        try {
            const shareId = crypto.randomBytes(32).toString('hex');
            const expiresAt = shareData.expiresAt ||
                new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days default

            const shareLink = {
                shareId,
                documentId: document._id,
                createdBy: shareData.createdBy,
                expiresAt,
                permissions: shareData.permissions || { view: true, download: false },
                accessCount: 0,
                lastAccessed: null
            };

            // Store share link in cache/database
            await this.#cacheService.set(
                `share-link:${shareId}`,
                shareLink,
                Math.floor((expiresAt - new Date()) / 1000)
            );

            const baseUrl = process.env.PUBLIC_SHARE_URL || 'https://app.company.com/shared';
            const url = `${baseUrl}/documents/${shareId}`;
            const shortUrl = await this.#generateShortUrl(url);

            return {
                shareId,
                url,
                shortUrl,
                expiresAt
            };
        } catch (error) {
            logger.error('Error generating public share link', {
                error: error.message,
                documentId: document._id
            });
            throw error;
        }
    }

    /**
     * Send document sharing notifications
     * @private
     * @param {Object} document - Document object
     * @param {Object} shareData - Share configuration
     * @param {string} userId - User sharing document
     */
    async #sendShareNotifications(document, shareData, userId) {
        try {
            const client = await ClientModel.findById(document.clientId);

            if (shareData.type === 'external_email' && shareData.recipientEmail) {
                await this.#emailService.sendTemplate('document-shared', {
                    to: shareData.recipientEmail,
                    data: {
                        documentName: document.documentInfo.name,
                        clientName: client.companyName,
                        sharedBy: userId,
                        accessUrl: shareData.accessUrl,
                        expiresAt: shareData.expiresAt,
                        message: shareData.message
                    }
                });
            }

            if (shareData.type === 'user' && shareData.recipientId) {
                await this.#notificationService.send({
                    type: 'document_shared_with_you',
                    recipient: shareData.recipientId,
                    data: {
                        documentName: document.documentInfo.name,
                        clientName: client.companyName,
                        sharedBy: userId,
                        permissions: shareData.permissions
                    }
                });
            }

            logger.debug('Share notifications sent', {
                documentId: document._id,
                shareType: shareData.type,
                recipient: shareData.recipientEmail || shareData.recipientId
            });
        } catch (error) {
            logger.error('Error sending share notifications', {
                error: error.message,
                documentId: document._id
            });
            // Don't throw - notifications are not critical
        }
    }

    /**
     * Validate document permissions structure
     * @private
     * @param {Object} permissions - Permissions object
     */
    async #validatePermissions(permissions) {
        const errors = [];

        if (!permissions || typeof permissions !== 'object') {
            errors.push('Permissions must be an object');
            return;
        }

        const validActions = ['read', 'write', 'delete', 'share', 'admin'];

        if (permissions.users && Array.isArray(permissions.users)) {
            for (const userPerm of permissions.users) {
                if (!userPerm.userId) {
                    errors.push('User ID is required in user permissions');
                }

                if (userPerm.permissions) {
                    for (const action of Object.keys(userPerm.permissions)) {
                        if (!validActions.includes(action)) {
                            errors.push(`Invalid permission action: ${action}`);
                        }
                    }
                }

                if (userPerm.expiresAt && new Date(userPerm.expiresAt) <= new Date()) {
                    errors.push('Permission expiration date must be in the future');
                }
            }
        }

        if (permissions.groups && Array.isArray(permissions.groups)) {
            for (const groupPerm of permissions.groups) {
                if (!groupPerm.groupId) {
                    errors.push('Group ID is required in group permissions');
                }
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'PERMISSIONS_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Notify users about permission changes
     * @private
     * @param {Object} document - Document object
     * @param {Object} permissions - New permissions
     * @param {string} userId - User making changes
     */
    async #notifyPermissionChanges(document, permissions, userId) {
        try {
            const affectedUsers = permissions.users || [];

            for (const userPerm of affectedUsers) {
                if (userPerm.userId.toString() !== userId) {
                    await this.#notificationService.send({
                        type: 'document_permissions_changed',
                        recipient: userPerm.userId,
                        data: {
                            documentName: document.documentInfo.name,
                            permissions: userPerm.permissions,
                            changedBy: userId
                        }
                    });
                }
            }

            logger.debug('Permission change notifications sent', {
                documentId: document._id,
                recipientCount: affectedUsers.length
            });
        } catch (error) {
            logger.error('Error sending permission change notifications', {
                error: error.message,
                documentId: document._id
            });
            // Don't throw - notifications are not critical
        }
    }

    /**
     * Execute workflow step
     * @private
     * @param {Object} document - Document object
     * @param {Object} step - Workflow step to execute
     */
    async #executeWorkflowStep(document, step) {
        try {
            switch (step.type) {
                case 'review':
                    await this.#executeReviewStep(document, step);
                    break;
                case 'approval':
                    await this.#executeApprovalStep(document, step);
                    break;
                case 'signature':
                    await this.#executeSignatureStep(document, step);
                    break;
                case 'notification':
                    await this.#executeNotificationStep(document, step);
                    break;
                default:
                    logger.warn('Unknown workflow step type', {
                        documentId: document._id,
                        stepType: step.type
                    });
            }

            // Update step status
            await ClientDocumentModel.findByIdAndUpdate(
                document._id,
                {
                    $set: {
                        'lifecycle.workflow.steps.$[step].status': 'completed',
                        'lifecycle.workflow.steps.$[step].completedAt': new Date()
                    }
                },
                {
                    arrayFilters: [{ 'step.name': step.name }]
                }
            );

            logger.debug('Workflow step executed', {
                documentId: document._id,
                stepName: step.name,
                stepType: step.type
            });
        } catch (error) {
            logger.error('Error executing workflow step', {
                error: error.message,
                documentId: document._id,
                stepName: step.name
            });

            // Mark step as failed
            await ClientDocumentModel.findByIdAndUpdate(
                document._id,
                {
                    $set: {
                        'lifecycle.workflow.steps.$[step].status': 'failed',
                        'lifecycle.workflow.steps.$[step].failureReason': error.message
                    }
                },
                {
                    arrayFilters: [{ 'step.name': step.name }]
                }
            );
        }
    }

    /**
     * Send workflow notifications
     * @private
     * @param {Object} document - Document object
     * @param {Object} workflow - Workflow instance
     * @param {string} event - Workflow event type
     */
    async #sendWorkflowNotifications(document, workflow, event) {
        try {
            const client = await ClientModel.findById(document.clientId);

            const notificationTypes = {
                started: 'workflow_started',
                step_completed: 'workflow_step_completed',
                completed: 'workflow_completed',
                failed: 'workflow_failed'
            };

            const notificationType = notificationTypes[event] || 'workflow_update';

            // Get workflow participants
            const participants = workflow.steps
                .filter(step => step.assignee)
                .map(step => step.assignee);

            for (const participant of participants) {
                await this.#notificationService.send({
                    type: notificationType,
                    recipient: participant,
                    data: {
                        documentName: document.documentInfo.name,
                        clientName: client.companyName,
                        workflowType: workflow.type,
                        currentStep: workflow.currentStep,
                        event
                    }
                });
            }

            logger.debug('Workflow notifications sent', {
                documentId: document._id,
                workflowType: workflow.type,
                event,
                recipientCount: participants.length
            });
        } catch (error) {
            logger.error('Error sending workflow notifications', {
                error: error.message,
                documentId: document._id
            });
            // Don't throw - notifications are not critical
        }
    }

    /**
     * Validate document signatories
     * @private
     * @param {Array} signatories - Array of signatory objects
     */
    async #validateSignatories(signatories) {
        const errors = [];

        if (!Array.isArray(signatories) || signatories.length === 0) {
            errors.push('At least one signatory is required');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        for (const [index, signatory] of signatories.entries()) {
            if (!signatory.name) {
                errors.push(`Signatory ${index + 1}: Name is required`);
            }

            if (!signatory.email) {
                errors.push(`Signatory ${index + 1}: Email is required`);
            } else if (!emailRegex.test(signatory.email)) {
                errors.push(`Signatory ${index + 1}: Invalid email format`);
            }

            if (typeof signatory.order !== 'number' || signatory.order < 1) {
                errors.push(`Signatory ${index + 1}: Valid signing order is required`);
            }

            if (signatory.required !== undefined && typeof signatory.required !== 'boolean') {
                errors.push(`Signatory ${index + 1}: Required field must be boolean`);
            }
        }

        // Check for duplicate emails
        const emails = signatories.map(s => s.email);
        const duplicateEmails = emails.filter((email, index) => emails.indexOf(email) !== index);
        if (duplicateEmails.length > 0) {
            errors.push(`Duplicate signatory emails: ${duplicateEmails.join(', ')}`);
        }

        // Check for duplicate orders
        const orders = signatories.map(s => s.order);
        const duplicateOrders = orders.filter((order, index) => orders.indexOf(order) !== index);
        if (duplicateOrders.length > 0) {
            errors.push(`Duplicate signing orders: ${duplicateOrders.join(', ')}`);
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'SIGNATORIES_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Send signature invitation to signatory
     * @private
     * @param {Object} document - Document object
     * @param {Object} signatory - Signatory information
     * @param {string} userId - User requesting signatures
     */
    async #sendSignatureInvitation(document, signatory, userId) {
        try {
            const client = await ClientModel.findById(document.clientId);
            const signatureUrl = await this.#generateSignatureUrl(document, signatory);

            await this.#emailService.sendTemplate('signature-invitation', {
                to: signatory.email,
                data: {
                    signatoryName: signatory.name,
                    documentName: document.documentInfo.name,
                    clientName: client.companyName,
                    requestedBy: userId,
                    signatureUrl: signatureUrl,
                    signingOrder: signatory.order,
                    dueDate: signatory.dueDate,
                    instructions: signatory.instructions
                }
            });

            logger.debug('Signature invitation sent', {
                documentId: document._id,
                signatoryEmail: signatory.email,
                signingOrder: signatory.order
            });
        } catch (error) {
            logger.error('Error sending signature invitation', {
                error: error.message,
                documentId: document._id,
                signatoryEmail: signatory.email
            });
            // Don't throw - continue with other signatories
        }
    }

    /**
     * Schedule retention action for document
     * @private
     * @param {Object} document - Document object
     * @param {Date} retentionDate - Date when retention action should occur
     */
    async #scheduleRetentionAction(document, retentionDate) {
        try {
            // In production, integrate with job scheduler (e.g., Bull Queue, Agenda)
            const retentionJob = {
                documentId: document._id,
                action: 'review_for_disposition',
                scheduledFor: retentionDate,
                retentionPolicy: document.lifecycle.retention.policy
            };

            // Store scheduled action
            await this.#cacheService.set(
                `retention-action:${document._id}`,
                retentionJob,
                Math.floor((retentionDate - new Date()) / 1000)
            );

            logger.debug('Retention action scheduled', {
                documentId: document._id,
                scheduledFor: retentionDate
            });
        } catch (error) {
            logger.error('Error scheduling retention action', {
                error: error.message,
                documentId: document._id,
                retentionDate
            });
            // Don't throw - scheduling is not critical
        }
    }

    /**
     * Check compliance against specific regulation
     * @private
     * @param {Object} document - Document object
     * @param {string} regulation - Regulation name
     * @returns {Promise<Object>} Compliance check result
     */
    async #checkRegulationCompliance(document, regulation) {
        const result = {
            regulation,
            compliant: true,
            issues: [],
            recommendations: []
        };

        try {
            switch (regulation.toLowerCase()) {
                case 'gdpr':
                    return await this.#checkGDPRCompliance(document);
                case 'sox':
                    return await this.#checkSOXCompliance(document);
                case 'hipaa':
                    return await this.#checkHIPAACompliance(document);
                case 'iso27001':
                    return await this.#checkISO27001Compliance(document);
                default:
                    result.compliant = false;
                    result.issues.push(`Unknown regulation: ${regulation}`);
                    result.recommendations.push('Verify regulation name and requirements');
            }

            return result;
        } catch (error) {
            logger.error('Error checking regulation compliance', {
                error: error.message,
                documentId: document._id,
                regulation
            });

            result.compliant = false;
            result.issues.push(`Error checking ${regulation} compliance: ${error.message}`);
            return result;
        }
    }

    /**
     * Check if user can download document
     * @private
     * @param {Object} document - Document object
     * @param {string} userId - User ID
     * @returns {Promise<boolean>} Download permission
     */
    async #canDownload(document, userId) {
        try {
            if (!userId) return false;

            // Owner can always download
            if (document.accessControl.owner.toString() === userId) {
                return true;
            }

            // Check user permissions
            const userPermission = document.accessControl.permissions.users?.find(
                u => u.userId.toString() === userId
            );

            if (userPermission && userPermission.permissions.read) {
                // Check if download is specifically disabled
                return !document.accessControl.restrictions?.downloadDisabled;
            }

            return false;
        } catch (error) {
            logger.error('Error checking download permission', {
                error: error.message,
                documentId: document._id,
                userId
            });
            return false;
        }
    }

    /**
     * Get thumbnail URL for document
     * @private
     * @param {Object} document - Document object
     * @returns {Promise<string|null>} Thumbnail URL
     */
    async #getThumbnailUrl(document) {
        try {
            if (!this.#isImage(document.fileDetails.mimeType)) {
                return null;
            }

            const thumbnails = document.processing?.thumbnails;
            if (thumbnails?.medium?.url) {
                return thumbnails.medium.url;
            }

            // Generate placeholder URL for non-image documents
            return `/api/documents/${document._id}/thumbnail`;
        } catch (error) {
            logger.error('Error getting thumbnail URL', {
                error: error.message,
                documentId: document._id
            });
            return null;
        }
    }

    /**
     * Generate search facets for filtering
     * @private
     * @param {Object} searchCriteria - Search criteria
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<Object>} Search facets
     */
    async #generateSearchFacets(searchCriteria, tenantId) {
        try {
            const query = { tenantId, isDeleted: false };
            if (searchCriteria.clientId) query.clientId = searchCriteria.clientId;

            const facets = await ClientDocumentModel.aggregate([
                { $match: query },
                {
                    $facet: {
                        types: [
                            { $group: { _id: '$documentInfo.type', count: { $sum: 1 } } },
                            { $sort: { count: -1 } }
                        ],
                        classifications: [
                            { $group: { _id: '$documentInfo.classification.level', count: { $sum: 1 } } },
                            { $sort: { count: -1 } }
                        ],
                        extensions: [
                            { $group: { _id: '$fileDetails.fileExtension', count: { $sum: 1 } } },
                            { $sort: { count: -1 } }
                        ],
                        sizes: [
                            {
                                $bucket: {
                                    groupBy: '$fileDetails.size',
                                    boundaries: [0, 1024, 1048576, 10485760, 104857600, Infinity],
                                    default: 'Other',
                                    output: { count: { $sum: 1 } }
                                }
                            }
                        ]
                    }
                }
            ]);

            return facets[0] || {
                types: [],
                classifications: [],
                extensions: [],
                sizes: []
            };
        } catch (error) {
            logger.error('Error generating search facets', {
                error: error.message,
                searchCriteria
            });
            return { types: [], classifications: [], extensions: [], sizes: [] };
        }
    }

    /**
     * Check if file type supports text extraction
     * @private
     * @param {string} mimeType - MIME type
     * @returns {boolean} Whether text extraction is supported
     */
    #isTextExtractable(mimeType) {
        const extractableTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/html',
            'text/csv'
        ];

        return extractableTypes.includes(mimeType);
    }

    /**
     * Check if file is compressed
     * @private
     * @param {string} mimeType - MIME type
     * @returns {boolean} Whether file is compressed
     */
    #isCompressed(mimeType) {
        const compressedTypes = [
            'application/zip',
            'application/x-rar-compressed',
            'application/x-7z-compressed',
            'application/gzip',
            'image/jpeg',
            'image/png'
        ];

        return compressedTypes.includes(mimeType);
    }

    // ==================== Additional Helper Methods ====================

    /**
     * Check user permission for client
     * @private
     */
    async #hasClientPermission(userId, clientId, action) {
        // Implement user permission checking logic
        // This would integrate with your user management system
        return true; // Simplified for example
    }

    /**
     * Extract text from PDF
     * @private
     */
    async #extractTextFromPDF(buffer) {
        // Implement PDF text extraction
        // Use libraries like pdf-parse or pdf2pic
        return '[PDF text content would be extracted here]';
    }

    /**
     * Extract text from Word documents
     * @private
     */
    async #extractTextFromWord(buffer) {
        // Implement Word document text extraction
        // Use libraries like mammoth or docx
        return '[Word document text content would be extracted here]';
    }

    /**
     * Generate search tokens from text
     * @private
     */
    #generateSearchTokens(text) {
        return text
            .toLowerCase()
            .split(/\s+/)
            .filter(token => token.length > 2)
            .slice(0, 1000); // Limit tokens
    }

    /**
     * Apply watermark to PDF
     * @private
     */
    async #applyPDFWatermark(buffer, text) {
        // Implement PDF watermarking
        // Use libraries like PDFKit or HummusJS
        return buffer; // Return original for now
    }

    /**
     * Apply watermark to image
     * @private
     */
    async #applyImageWatermark(buffer, text) {
        try {
            return await sharp(buffer)
                .composite([{
                    input: Buffer.from(`<svg><text x="10" y="30" font-size="20" fill="rgba(255,255,255,0.5)">${text}</text></svg>`),
                    gravity: 'southeast'
                }])
                .toBuffer();
        } catch (error) {
            logger.error('Error applying image watermark', { error: error.message });
            return buffer;
        }
    }

    /**
     * Generate short URL
     * @private
     */
    async #generateShortUrl(url) {
        // Implement URL shortening
        // This could integrate with services like bit.ly or a custom shortener
        const shortCode = crypto.randomBytes(4).toString('hex');
        return `https://short.company.com/${shortCode}`;
    }

    /**
     * Generate signature URL
     * @private
     */
    async #generateSignatureUrl(document, signatory) {
        const signatureToken = crypto.randomBytes(32).toString('hex');
        const baseUrl = process.env.SIGNATURE_URL || 'https://app.company.com/sign';

        return `${baseUrl}/${signatureToken}?doc=${document._id}&email=${encodeURIComponent(signatory.email)}`;
    }

    /**
     * Execute review workflow step
     * @private
     */
    async #executeReviewStep(document, step) {
        if (step.assignee) {
            await this.#notificationService.send({
                type: 'document_review_requested',
                recipient: step.assignee,
                data: {
                    documentName: document.documentInfo.name,
                    documentId: document._id
                }
            });
        }
    }

    /**
     * Execute approval workflow step
     * @private
     */
    async #executeApprovalStep(document, step) {
        if (step.assignee) {
            await this.#notificationService.send({
                type: 'document_approval_requested',
                recipient: step.assignee,
                data: {
                    documentName: document.documentInfo.name,
                    documentId: document._id
                }
            });
        }
    }

    /**
     * Execute signature workflow step
     * @private
     */
    async #executeSignatureStep(document, step) {
        // Signature steps are handled by requestDocumentSignatures
        logger.debug('Signature step executed', {
            documentId: document._id,
            stepName: step.name
        });
    }

    /**
     * Execute notification workflow step
     * @private
     */
    async #executeNotificationStep(document, step) {
        if (step.assignee) {
            await this.#notificationService.send({
                type: 'document_workflow_notification',
                recipient: step.assignee,
                data: {
                    documentName: document.documentInfo.name,
                    documentId: document._id,
                    message: step.message || 'Document workflow notification'
                }
            });
        }
    }

    /**
     * Check GDPR compliance
     * @private
     */
    async #checkGDPRCompliance(document) {
        const result = {
            regulation: 'gdpr',
            compliant: true,
            issues: [],
            recommendations: []
        };

        // Check data minimization
        if (!document.compliance.dataMinimization?.applied) {
            result.issues.push('Data minimization not applied');
            result.recommendations.push('Review and minimize stored personal data');
        }

        // Check retention policy
        if (!document.lifecycle.retention?.policy) {
            result.issues.push('No retention policy defined');
            result.recommendations.push('Define and apply appropriate retention policy');
        }

        // Check consent tracking
        if (document.documentInfo.classification.level === 'personal_data' &&
            !document.compliance.consent?.recorded) {
            result.issues.push('Consent not recorded for personal data');
            result.recommendations.push('Record and track consent for personal data processing');
        }

        result.compliant = result.issues.length === 0;
        return result;
    }

    /**
     * Check SOX compliance
     * @private
     */
    async #checkSOXCompliance(document) {
        const result = {
            regulation: 'sox',
            compliant: true,
            issues: [],
            recommendations: []
        };

        if (document.documentInfo.type === 'financial') {
            // Check audit trail
            if (!document.compliance.audit?.required) {
                result.issues.push('Audit trail not enabled for financial document');
                result.recommendations.push('Enable comprehensive audit logging');
            }

            // Check retention policy
            const retentionYears = document.lifecycle.retention?.retentionPeriod?.value;
            if (!retentionYears || retentionYears < 7) {
                result.issues.push('Insufficient retention period for financial documents');
                result.recommendations.push('Apply minimum 7-year retention policy');
            }
        }

        result.compliant = result.issues.length === 0;
        return result;
    }

    /**
     * Check HIPAA compliance
     * @private
     */
    async #checkHIPAACompliance(document) {
        const result = {
            regulation: 'hipaa',
            compliant: true,
            issues: [],
            recommendations: []
        };

        if (document.documentInfo.classification.level === 'phi' ||
            document.documentInfo.type === 'healthcare') {

            // Check encryption
            if (!document.storage.encryption.enabled) {
                result.issues.push('PHI document not encrypted');
                result.recommendations.push('Enable encryption for all PHI documents');
            }

            // Check access controls
            if (!document.accessControl.permissions?.users?.length) {
                result.issues.push('No specific access controls defined');
                result.recommendations.push('Implement minimum necessary access controls');
            }
        }

        result.compliant = result.issues.length === 0;
        return result;
    }

    /**
     * Check ISO 27001 compliance
     * @private
     */
    async #checkISO27001Compliance(document) {
        const result = {
            regulation: 'iso27001',
            compliant: true,
            issues: [],
            recommendations: []
        };

        // Check classification
        if (!document.documentInfo.classification?.level) {
            result.issues.push('Document classification not defined');
            result.recommendations.push('Classify document according to information sensitivity');
        }

        // Check handling procedures
        if (document.documentInfo.classification.level === 'confidential' &&
            !document.compliance.handling?.procedures) {
            result.issues.push('No handling procedures defined for confidential document');
            result.recommendations.push('Define appropriate handling and disposal procedures');
        }

        result.compliant = result.issues.length === 0;
        return result;
    }

    /**
 * Update document metadata and information
 * @param {string} documentId - Document ID
 * @param {Object} updateData - Data to update
 * @param {string} userId - User performing update
 * @returns {Promise<Object>} Updated document
 */
    async updateDocument(documentId, updateData, userId) {
        try {
            // Get existing document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Prepare update fields
            const updateFields = {};
            if (updateData.name) updateFields['documentInfo.name'] = updateData.name;
            if (updateData.description) updateFields['documentInfo.description'] = updateData.description;
            if (updateData.type) updateFields['documentInfo.type'] = updateData.type;
            if (updateData.category) updateFields['documentInfo.category'] = updateData.category;
            if (updateData.classification) updateFields['documentInfo.classification'] = updateData.classification;
            if (updateData.keywords) updateFields['documentInfo.keywords'] = updateData.keywords;

            // Update document
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        ...updateFields,
                        'metadata.lastModifiedBy': userId,
                        'metadata.lastModifiedAt': new Date()
                    }
                },
                { new: true }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_UPDATED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { updatedFields: Object.keys(updateFields) }
            });

            // Clear caches
            await this.#clearDocumentCaches(document.tenantId, document.clientId);

            return updatedDocument;
        } catch (error) {
            logger.error('Error updating document', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Delete document (soft or hard delete)
     * @param {string} documentId - Document ID
     * @param {string} userId - User performing deletion
     * @param {Object} options - Deletion options
     * @returns {Promise<Object>} Deletion result
     */
    async deleteDocument(documentId, userId, options = {}) {
        const { permanent = false } = options;

        try {
            // Get existing document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'delete');

            let result;

            if (permanent) {
                // Hard delete - remove from storage and database
                await this.#deleteFromStorage(document);
                result = await ClientDocumentModel.findByIdAndDelete(documentId);
            } else {
                // Soft delete - mark as deleted
                result = await ClientDocumentModel.findByIdAndUpdate(
                    documentId,
                    {
                        $set: {
                            isDeleted: true,
                            'lifecycle.deletedAt': new Date(),
                            'lifecycle.deletedBy': userId,
                            'metadata.lastModifiedBy': userId,
                            'metadata.lastModifiedAt': new Date()
                        }
                    },
                    { new: true }
                );
            }

            // Log audit trail
            await this.#auditService.log({
                action: permanent ? 'DOCUMENT_PERMANENTLY_DELETED' : 'DOCUMENT_DELETED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { permanent }
            });

            // Clear caches
            await this.#clearDocumentCaches(document.tenantId, document.clientId);

            return result;
        } catch (error) {
            logger.error('Error deleting document', {
                error: error.message,
                documentId,
                userId,
                permanent
            });
            throw error;
        }
    }

    /**
     * Get document versions (public method)
     * @param {string} documentId - Document ID
     * @param {string} userId - User requesting versions
     * @returns {Promise<Array>} Document versions
     */
    async getDocumentVersions(documentId, userId) {
        try {
            // Get document to check permissions
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'read');

            // Use existing private method
            return await this.#getDocumentVersions(document);
        } catch (error) {
            logger.error('Error getting document versions', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Update workflow status
     * @param {string} documentId - Document ID
     * @param {string} workflowId - Workflow ID
     * @param {string} status - New status
     * @param {string} userId - User updating status
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated workflow
     */
    async updateWorkflowStatus(documentId, workflowId, status, userId, options = {}) {
        const { comments, stepData } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Validate workflow exists
            if (!document.lifecycle.workflow || document.lifecycle.workflow.id !== workflowId) {
                throw new NotFoundError('Workflow not found', 'WORKFLOW_NOT_FOUND');
            }

            // Update workflow status
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'lifecycle.workflow.status': status,
                        'lifecycle.workflow.lastUpdated': new Date(),
                        'lifecycle.workflow.lastUpdatedBy': userId,
                        ...(comments && { 'lifecycle.workflow.comments': comments }),
                        ...(stepData && { 'lifecycle.workflow.stepData': stepData })
                    }
                },
                { new: true }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'WORKFLOW_STATUS_UPDATED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { workflowId, oldStatus: document.lifecycle.workflow.status, newStatus: status }
            });

            return updatedDocument.lifecycle.workflow;
        } catch (error) {
            logger.error('Error updating workflow status', {
                error: error.message,
                documentId,
                workflowId,
                userId
            });
            throw error;
        }
    }

    /**
     * Complete document signature
     * @param {string} documentId - Document ID
     * @param {string} signatureId - Signature ID
     * @param {Object} signatureData - Signature completion data
     * @param {string} userId - User completing signature
     * @returns {Promise<Object>} Signature completion result
     */
    async completeDocumentSignature(documentId, signatureId, signatureData, userId) {
        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Find signature request
            const signatureRequest = document.signatures?.signatories?.find(
                s => s.id === signatureId
            );

            if (!signatureRequest) {
                throw new NotFoundError('Signature request not found', 'SIGNATURE_NOT_FOUND');
            }

            // Validate signature authority
            if (signatureRequest.email !== req.user?.email && userId !== signatureRequest.userId) {
                throw new ForbiddenError('Not authorized to complete this signature', 'SIGNATURE_NOT_AUTHORIZED');
            }

            // Update signature
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'signatures.signatories.$[sig].status': 'completed',
                        'signatures.signatories.$[sig].signedAt': new Date(),
                        'signatures.signatories.$[sig].signatureData': signatureData.signatureData,
                        'signatures.signatories.$[sig].ipAddress': signatureData.ipAddress,
                        'signatures.signatories.$[sig].userAgent': signatureData.userAgent
                    }
                },
                {
                    arrayFilters: [{ 'sig.id': signatureId }],
                    new: true
                }
            );

            // Check if all required signatures are complete
            const allSigned = updatedDocument.signatures.signatories
                .filter(s => s.required)
                .every(s => s.status === 'completed');

            if (allSigned) {
                await ClientDocumentModel.findByIdAndUpdate(
                    documentId,
                    {
                        $set: {
                            'signatures.status': 'completed',
                            'signatures.completedAt': new Date(),
                            'lifecycle.status': 'signed'
                        }
                    }
                );
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_SIGNATURE_COMPLETED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { signatureId, signatureType: signatureData.signatureType }
            });

            return {
                signatureId,
                status: 'completed',
                signedAt: new Date(),
                allSignaturesComplete: allSigned
            };
        } catch (error) {
            logger.error('Error completing document signature', {
                error: error.message,
                documentId,
                signatureId,
                userId
            });
            throw error;
        }
    }

    /**
     * Generate document report
     * @param {string} clientId - Client ID (optional)
     * @param {Object} options - Report options
     * @returns {Promise<Object>} Generated report
     */
    async generateDocumentReport(clientId = null, options = {}) {
        const {
            reportType = 'summary',
            dateRange = { start: moment().subtract(30, 'days').toDate(), end: new Date() },
            format = 'json'
        } = options;

        try {
            const query = {
                isDeleted: false,
                createdAt: { $gte: dateRange.start, $lte: dateRange.end }
            };

            if (clientId) query.clientId = clientId;

            // Generate report based on type
            let reportData;

            switch (reportType) {
                case 'summary':
                    reportData = await this.#generateSummaryReport(query, options);
                    break;
                case 'detailed':
                    reportData = await this.#generateDetailedReport(query, options);
                    break;
                case 'compliance':
                    reportData = await this.#generateComplianceReport(query, options);
                    break;
                case 'usage':
                    reportData = await this.#generateUsageReport(query, options);
                    break;
                default:
                    throw new ValidationError(`Unknown report type: ${reportType}`, 'INVALID_REPORT_TYPE');
            }

            // Format report based on requested format
            if (format === 'pdf') {
                const pdfBuffer = await this.#generatePDFReport(reportData);
                return { buffer: pdfBuffer, format: 'pdf' };
            }

            return { data: reportData, format: 'json' };
        } catch (error) {
            logger.error('Error generating document report', {
                error: error.message,
                clientId,
                reportType,
                format
            });
            throw error;
        }
    }

    /**
     * Archive document
     * @param {string} documentId - Document ID
     * @param {string} userId - User archiving document
     * @param {Object} options - Archive options
     * @returns {Promise<Object>} Archived document
     */
    async archiveDocument(documentId, userId, options = {}) {
        const { reason, scheduledDate } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Update document
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'lifecycle.status': 'archived',
                        'lifecycle.archivedAt': scheduledDate || new Date(),
                        'lifecycle.archivedBy': userId,
                        'lifecycle.archiveReason': reason
                    }
                },
                { new: true }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_ARCHIVED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { reason, scheduledDate }
            });

            return updatedDocument;
        } catch (error) {
            logger.error('Error archiving document', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Unarchive document
     * @param {string} documentId - Document ID
     * @param {string} userId - User unarchiving document
     * @param {Object} options - Unarchive options
     * @returns {Promise<Object>} Unarchived document
     */
    async unarchiveDocument(documentId, userId, options = {}) {
        const { reason } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Update document
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'lifecycle.status': 'active',
                        'lifecycle.unarchivedAt': new Date(),
                        'lifecycle.unarchivedBy': userId,
                        'lifecycle.unarchiveReason': reason
                    },
                    $unset: {
                        'lifecycle.archivedAt': 1,
                        'lifecycle.archivedBy': 1,
                        'lifecycle.archiveReason': 1
                    }
                },
                { new: true }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_UNARCHIVED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { reason }
            });

            return updatedDocument;
        } catch (error) {
            logger.error('Error unarchiving document', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Lock document for editing
     * @param {string} documentId - Document ID
     * @param {string} userId - User locking document
     * @param {Object} options - Lock options
     * @returns {Promise<Object>} Lock result
     */
    async lockDocument(documentId, userId, options = {}) {
        const { reason, duration = 3600 } = options; // Default 1 hour

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Check if already locked
            const existingLock = this.#documentLocks.get(documentId);
            if (existingLock && existingLock.expiresAt > new Date()) {
                throw new ConflictError('Document is already locked', 'DOCUMENT_ALREADY_LOCKED');
            }

            // Create lock
            const lockData = {
                userId,
                lockedAt: new Date(),
                expiresAt: new Date(Date.now() + duration * 1000),
                reason
            };

            // Store lock
            this.#documentLocks.set(documentId, lockData);

            // Update document
            await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'accessControl.locked': true,
                        'accessControl.lockedBy': userId,
                        'accessControl.lockedAt': lockData.lockedAt,
                        'accessControl.lockExpires': lockData.expiresAt
                    }
                }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_LOCKED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { reason, duration }
            });

            return lockData;
        } catch (error) {
            logger.error('Error locking document', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Unlock document
     * @param {string} documentId - Document ID
     * @param {string} userId - User unlocking document
     * @param {Object} options - Unlock options
     * @returns {Promise<Object>} Unlock result
     */
    async unlockDocument(documentId, userId, options = {}) {
        const { force = false } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Get lock info
            const lockData = this.#documentLocks.get(documentId);
            if (!lockData) {
                throw new ConflictError('Document is not locked', 'DOCUMENT_NOT_LOCKED');
            }

            // Check unlock permissions
            if (!force && lockData.userId !== userId && !req.user?.role === 'admin') {
                throw new ForbiddenError('Cannot unlock document locked by another user', 'UNLOCK_FORBIDDEN');
            }

            // Remove lock
            this.#documentLocks.delete(documentId);

            // Update document
            await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $unset: {
                        'accessControl.locked': 1,
                        'accessControl.lockedBy': 1,
                        'accessControl.lockedAt': 1,
                        'accessControl.lockExpires': 1
                    }
                }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_UNLOCKED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { force, originalLocker: lockData.userId }
            });

            return { unlocked: true, unlockedAt: new Date() };
        } catch (error) {
            logger.error('Error unlocking document', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Tag document
     * @param {string} documentId - Document ID
     * @param {Array} tags - Tags to add
     * @param {string} userId - User adding tags
     * @returns {Promise<Object>} Tagged document
     */
    async tagDocument(documentId, tags, userId) {
        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Validate and sanitize tags
            const validTags = tags
                .filter(tag => typeof tag === 'string' && tag.trim().length > 0)
                .map(tag => tag.trim().toLowerCase())
                .filter((tag, index, arr) => arr.indexOf(tag) === index); // Remove duplicates

            // Add tags
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $addToSet: { 'documentInfo.keywords': { $each: validTags } }
                },
                { new: true }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_TAGGED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { addedTags: validTags }
            });

            return updatedDocument;
        } catch (error) {
            logger.error('Error tagging document', {
                error: error.message,
                documentId,
                tags,
                userId
            });
            throw error;
        }
    }

    /**
     * Remove tag from document
     * @param {string} documentId - Document ID
     * @param {string} tag - Tag to remove
     * @param {string} userId - User removing tag
     * @returns {Promise<Object>} Untagged document
     */
    async untagDocument(documentId, tag, userId) {
        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Remove tag
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $pull: { 'documentInfo.keywords': tag.toLowerCase() }
                },
                { new: true }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_UNTAGGED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { removedTag: tag }
            });

            return updatedDocument;
        } catch (error) {
            logger.error('Error removing tag from document', {
                error: error.message,
                documentId,
                tag,
                userId
            });
            throw error;
        }
    }

    /**
     * Move document to different location
     * @param {string} documentId - Document ID
     * @param {Object} targetLocation - Target location data
     * @param {string} userId - User moving document
     * @returns {Promise<Object>} Moved document
     */
    async moveDocument(documentId, targetLocation, userId) {
        const { targetClientId, targetProjectId, targetFolderId } = targetLocation;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions on source
            await this.#checkDocumentAccess(document, userId, 'write');

            // Validate target client if provided
            if (targetClientId) {
                const targetClient = await ClientModel.findById(targetClientId);
                if (!targetClient) {
                    throw new NotFoundError('Target client not found', 'TARGET_CLIENT_NOT_FOUND');
                }
            }

            // Prepare update data
            const updateData = {};
            if (targetClientId) updateData.clientId = targetClientId;
            if (targetProjectId) updateData.projectId = targetProjectId;
            if (targetFolderId) updateData.folderId = targetFolderId;

            // Update document
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                { $set: updateData },
                { new: true }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_MOVED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: {
                    originalClientId: document.clientId,
                    targetClientId,
                    targetProjectId,
                    targetFolderId
                }
            });

            return updatedDocument;
        } catch (error) {
            logger.error('Error moving document', {
                error: error.message,
                documentId,
                targetLocation,
                userId
            });
            throw error;
        }
    }

    /**
     * Copy document
     * @param {string} documentId - Document ID
     * @param {Object} copyOptions - Copy options
     * @param {string} userId - User copying document
     * @returns {Promise<Object>} Copied document
     */
    async copyDocument(documentId, copyOptions, userId) {
        const { targetClientId, targetProjectId, newName, copyContent = true } = copyOptions;

        try {
            // Get original document
            const originalDocument = await ClientDocumentModel.findById(documentId);
            if (!originalDocument) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(originalDocument, userId, 'read');

            // Validate target client
            if (targetClientId) {
                const targetClient = await ClientModel.findById(targetClientId);
                if (!targetClient) {
                    throw new NotFoundError('Target client not found', 'TARGET_CLIENT_NOT_FOUND');
                }
            }

            // Prepare copy data
            const copyData = {
                ...originalDocument.toObject(),
                _id: undefined,
                documentId: undefined,
                clientId: targetClientId || originalDocument.clientId,
                projectId: targetProjectId || originalDocument.projectId,
                documentInfo: {
                    ...originalDocument.documentInfo,
                    name: newName || `Copy of ${originalDocument.documentInfo.name}`
                },
                metadata: {
                    source: 'copy',
                    originalDocumentId: documentId,
                    createdBy: userId,
                    uploadedBy: userId
                },
                relationships: {
                    relatedDocuments: [{
                        documentId: originalDocument._id,
                        relationship: 'copied_from'
                    }]
                }
            };

            // Copy file content if requested
            if (copyContent) {
                const fileBuffer = await this.#getDocumentContent(originalDocument);
                const storageResult = await this.#uploadToStorage(
                    { buffer: fileBuffer, checksum: originalDocument.fileDetails.checksum },
                    originalDocument.storage.provider,
                    {
                        clientId: copyData.clientId,
                        encrypt: originalDocument.storage.encryption.enabled
                    }
                );

                copyData.storage = {
                    ...copyData.storage,
                    location: storageResult.location,
                    url: storageResult.url
                };
            }

            // Create copy
            const copiedDocument = await ClientDocumentModel.create(copyData);

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_COPIED',
                entityType: 'client_document',
                entityId: copiedDocument._id,
                userId,
                details: {
                    originalDocumentId: documentId,
                    targetClientId,
                    copyContent
                }
            });

            return copiedDocument;
        } catch (error) {
            logger.error('Error copying document', {
                error: error.message,
                documentId,
                copyOptions,
                userId
            });
            throw error;
        }
    }

    /**
     * Get document audit trail
     * @param {string} documentId - Document ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Audit trail entries
     */
    async getDocumentAuditTrail(documentId, options = {}) {
        const {
            page = 1,
            limit = 50,
            dateRange = { start: moment().subtract(90, 'days').toDate(), end: new Date() },
            actionTypes = null
        } = options;

        try {
            // Build query
            const query = {
                entityType: 'client_document',
                entityId: documentId,
                timestamp: { $gte: dateRange.start, $lte: dateRange.end }
            };

            if (actionTypes && actionTypes.length > 0) {
                query.action = { $in: actionTypes };
            }

            // Get audit entries with pagination
            const skip = (page - 1) * limit;
            const entries = await this.#auditService.query(query, {
                skip,
                limit,
                sort: { timestamp: -1 }
            });

            const total = await this.#auditService.count(query);

            return {
                entries,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    hasMore: skip + entries.length < total
                }
            };
        } catch (error) {
            logger.error('Error getting document audit trail', {
                error: error.message,
                documentId
            });
            throw error;
        }
    }

    /**
     * Generate thumbnails for document (public method)
     * @param {string} documentId - Document ID
     * @param {string} userId - User requesting thumbnails
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Generated thumbnails
     */
    async generateThumbnails(documentId, userId, options = {}) {
        const { sizes = ['small', 'medium', 'large'], force = false } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'read');

            // Check if thumbnails already exist
            if (!force && document.processing?.thumbnailsGenerated) {
                return document.processing.thumbnails || {};
            }

            // Get document content
            const fileBuffer = await this.#getDocumentContent(document);

            // Use existing private method
            await this.#generateThumbnails(document, fileBuffer);

            // Return updated thumbnails
            const updatedDocument = await ClientDocumentModel.findById(documentId);
            return updatedDocument.processing?.thumbnails || {};
        } catch (error) {
            logger.error('Error generating thumbnails', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Extract text from document (public method)
     * @param {string} documentId - Document ID
     * @param {string} userId - User requesting extraction
     * @param {Object} options - Extraction options
     * @returns {Promise<Object>} Extracted text content
     */
    async extractDocumentText(documentId, userId, options = {}) {
        const { includeMetadata = true, maxLength = null } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'read');

            // Check if text already extracted
            if (document.processing?.textExtracted && document.processing?.textContent) {
                let content = document.processing.textContent;
                if (maxLength && content.length > maxLength) {
                    content = content.substring(0, maxLength) + '...';
                }

                return {
                    content,
                    metadata: includeMetadata ? {
                        extractedAt: document.processing.textExtractedAt,
                        originalLength: document.processing.textContent.length,
                        truncated: maxLength && document.processing.textContent.length > maxLength
                    } : null
                };
            }

            // Extract text using private method
            await this.#extractText(document);

            // Get updated document
            const updatedDocument = await ClientDocumentModel.findById(documentId);
            let content = updatedDocument.processing?.textContent || '';

            if (maxLength && content.length > maxLength) {
                content = content.substring(0, maxLength) + '...';
            }

            return {
                content,
                metadata: includeMetadata ? {
                    extractedAt: new Date(),
                    originalLength: updatedDocument.processing?.textContent?.length || 0,
                    truncated: maxLength && (updatedDocument.processing?.textContent?.length || 0) > maxLength
                } : null
            };
        } catch (error) {
            logger.error('Error extracting document text', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Validate document structure and integrity
     * @param {string} documentId - Document ID
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result
     */
    async validateDocumentStructure(documentId, options = {}) {
        const { checkIntegrity = true, validateMetadata = true, repairIfPossible = false } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            const validationResult = {
                isValid: true,
                issues: [],
                repairs: [],
                metadata: {
                    documentId,
                    validatedAt: new Date(),
                    checks: {
                        integrity: checkIntegrity,
                        metadata: validateMetadata
                    }
                }
            };

            // Check file integrity
            if (checkIntegrity) {
                try {
                    const fileBuffer = await this.#getDocumentContent(document);
                    const currentChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

                    if (currentChecksum !== document.fileDetails.checksum.sha256) {
                        validationResult.isValid = false;
                        validationResult.issues.push({
                            type: 'integrity',
                            severity: 'high',
                            message: 'File checksum mismatch - file may be corrupted'
                        });
                    }
                } catch (error) {
                    validationResult.isValid = false;
                    validationResult.issues.push({
                        type: 'integrity',
                        severity: 'critical',
                        message: 'Cannot access file content'
                    });
                }
            }

            // Validate metadata
            if (validateMetadata) {
                if (!document.documentInfo?.name) {
                    validationResult.isValid = false;
                    validationResult.issues.push({
                        type: 'metadata',
                        severity: 'medium',
                        message: 'Document name is missing'
                    });
                }

                if (!document.fileDetails?.mimeType) {
                    validationResult.isValid = false;
                    validationResult.issues.push({
                        type: 'metadata',
                        severity: 'medium',
                        message: 'MIME type is missing'
                    });
                }
            }

            // Attempt repairs if requested
            if (repairIfPossible && validationResult.issues.length > 0) {
                for (const issue of validationResult.issues) {
                    if (issue.type === 'metadata' && issue.message.includes('Document name')) {
                        await ClientDocumentModel.findByIdAndUpdate(
                            documentId,
                            { $set: { 'documentInfo.name': document.fileDetails.originalName } }
                        );
                        validationResult.repairs.push('Fixed missing document name');
                    }
                }
            }

            return validationResult;
        } catch (error) {
            logger.error('Error validating document structure', {
                error: error.message,
                documentId
            });
            throw error;
        }
    }

    /**
     * Scan document for viruses and malware
     * @param {string} documentId - Document ID
     * @param {string} userId - User requesting scan
     * @param {Object} options - Scan options
     * @returns {Promise<Object>} Scan result
     */
    async scanDocumentForViruses(documentId, userId, options = {}) {
        const { deepScan = false, quarantineIfInfected = true } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'read');

            // Get file content
            const fileBuffer = await this.#getDocumentContent(document);

            // Perform virus scan (integrate with your antivirus service)
            const scanResult = {
                status: 'clean',
                threats: [],
                scanTime: new Date(),
                scanEngine: 'integrated_av',
                scanType: deepScan ? 'deep' : 'quick'
            };

            // Simulate scan logic - replace with actual antivirus integration
            // const threats = await this.#performVirusScan(fileBuffer, { deepScan });
            const threats = []; // Placeholder

            if (threats.length > 0) {
                scanResult.status = 'infected';
                scanResult.threats = threats;

                if (quarantineIfInfected) {
                    await ClientDocumentModel.findByIdAndUpdate(
                        documentId,
                        {
                            $set: {
                                'lifecycle.status': 'quarantined',
                                'lifecycle.quarantinedAt': new Date(),
                                'lifecycle.quarantineReason': 'virus_detected'
                            }
                        }
                    );
                    scanResult.quarantined = true;
                }
            }

            // Update document with scan results
            await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        'security.virusScan': scanResult,
                        'security.lastScanned': new Date()
                    }
                }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_VIRUS_SCANNED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: {
                    status: scanResult.status,
                    threatsFound: threats.length,
                    quarantined: scanResult.quarantined || false
                }
            });

            return scanResult;
        } catch (error) {
            logger.error('Error scanning document for viruses', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Optimize document for storage and performance
     * @param {string} documentId - Document ID
     * @param {string} userId - User requesting optimization
     * @param {Object} options - Optimization options
     * @returns {Promise<Object>} Optimization result
     */
    async optimizeDocument(documentId, userId, options = {}) {
        const { compressionLevel = 'medium', preserveQuality = true, createBackup = true } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Get original file
            const originalBuffer = await this.#getDocumentContent(document);
            const originalSize = originalBuffer.length;

            // Create backup if requested
            if (createBackup) {
                await this.#createDocumentBackup(document, originalBuffer);
            }

            // Optimize based on file type
            let optimizedBuffer = originalBuffer;
            const mimeType = document.fileDetails.mimeType;

            if (mimeType.startsWith('image/')) {
                optimizedBuffer = await this.#optimizeImage(originalBuffer, {
                    compressionLevel,
                    preserveQuality
                });
            } else if (mimeType === 'application/pdf') {
                optimizedBuffer = await this.#optimizePDF(originalBuffer, {
                    compressionLevel,
                    preserveQuality
                });
            }

            const optimizedSize = optimizedBuffer.length;
            const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

            // Upload optimized version if significantly smaller
            if (compressionRatio > 5) { // Only if more than 5% reduction
                const storageResult = await this.#uploadToStorage(
                    { buffer: optimizedBuffer, checksum: {} },
                    document.storage.provider,
                    {
                        clientId: document.clientId,
                        encrypt: document.storage.encryption.enabled
                    }
                );

                // Update document with optimized version
                await ClientDocumentModel.findByIdAndUpdate(
                    documentId,
                    {
                        $set: {
                            'storage.location': storageResult.location,
                            'storage.url': storageResult.url,
                            'fileDetails.size': optimizedSize,
                            'processing.optimized': true,
                            'processing.optimizedAt': new Date(),
                            'processing.optimizationRatio': compressionRatio
                        }
                    }
                );
            }

            const optimizationResult = {
                optimized: compressionRatio > 5,
                originalSize,
                optimizedSize,
                compressionRatio: Math.round(compressionRatio * 100) / 100,
                spaceSaved: originalSize - optimizedSize,
                optimizedAt: new Date()
            };

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_OPTIMIZED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: optimizationResult
            });

            return optimizationResult;
        } catch (error) {
            logger.error('Error optimizing document', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Convert document to different format
     * @param {string} documentId - Document ID
     * @param {string} targetFormat - Target format
     * @param {string} userId - User requesting conversion
     * @param {Object} options - Conversion options
     * @returns {Promise<Object>} Conversion result
     */
    async convertDocumentFormat(documentId, targetFormat, userId, options = {}) {
        const { quality = 'high', preserveFormatting = true, createNewDocument = false } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'read');

            // Get file content
            const originalBuffer = await this.#getDocumentContent(document);

            // Convert using private method
            const convertedBuffer = await this.#convertDocument(originalBuffer, document, targetFormat);

            if (createNewDocument) {
                // Create new document with converted content
                const newFileData = {
                    originalName: `${path.parse(document.fileDetails.originalName).name}.${targetFormat}`,
                    name: `${document.documentInfo.name} (${targetFormat.toUpperCase()})`,
                    description: `Converted from ${document.fileDetails.fileExtension} to ${targetFormat}`,
                    type: document.documentInfo.type,
                    category: document.documentInfo.category,
                    classification: document.documentInfo.classification,
                    keywords: document.documentInfo.keywords,
                    mimeType: mime.lookup(targetFormat) || 'application/octet-stream',
                    size: convertedBuffer.length,
                    buffer: convertedBuffer
                };

                const convertedDocument = await this.uploadDocument(
                    document.clientId,
                    newFileData,
                    userId,
                    { projectId: document.projectId }
                );

                return {
                    success: true,
                    newDocument: convertedDocument,
                    originalFormat: document.fileDetails.fileExtension,
                    targetFormat,
                    convertedAt: new Date()
                };
            } else {
                // Return converted buffer for download
                return {
                    success: true,
                    buffer: convertedBuffer,
                    metadata: {
                        fileName: `${path.parse(document.fileDetails.originalName).name}.${targetFormat}`,
                        mimeType: mime.lookup(targetFormat) || 'application/octet-stream',
                        size: convertedBuffer.length
                    },
                    originalFormat: document.fileDetails.fileExtension,
                    targetFormat,
                    convertedAt: new Date()
                };
            }
        } catch (error) {
            logger.error('Error converting document format', {
                error: error.message,
                documentId,
                targetFormat,
                userId
            });
            throw error;
        }
    }

    /**
     * Get document preview
     * @param {string} documentId - Document ID
     * @param {string} userId - User requesting preview
     * @param {Object} options - Preview options
     * @returns {Promise<Object>} Document preview
     */
    async getDocumentPreview(documentId, userId, options = {}) {
        const { pageNumber = 1, size = 'medium', format = 'image' } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'read');

            // Check if thumbnails exist for images
            if (this.#isImage(document.fileDetails.mimeType)) {
                const thumbnails = document.processing?.thumbnails;
                if (thumbnails && thumbnails[size]) {
                    return {
                        format: 'image',
                        mimeType: 'image/jpeg',
                        url: thumbnails[size].url,
                        width: thumbnails[size].width,
                        height: thumbnails[size].height
                    };
                }
            }

            // Generate preview for other document types
            const fileBuffer = await this.#getDocumentContent(document);
            let previewBuffer;

            switch (document.fileDetails.mimeType) {
                case 'application/pdf':
                    previewBuffer = await this.#generatePDFPreview(fileBuffer, pageNumber);
                    break;
                case 'text/plain':
                    const textContent = fileBuffer.toString('utf-8').substring(0, 5000);
                    return {
                        format: 'text',
                        content: textContent,
                        truncated: fileBuffer.length > 5000
                    };
                default:
                    throw new ValidationError(
                        `Preview not supported for ${document.fileDetails.mimeType}`,
                        'PREVIEW_NOT_SUPPORTED'
                    );
            }

            return {
                format: 'image',
                mimeType: 'image/jpeg',
                buffer: previewBuffer,
                pageNumber
            };
        } catch (error) {
            logger.error('Error getting document preview', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Get document metadata
     * @param {string} documentId - Document ID
     * @param {Object} options - Metadata options
     * @returns {Promise<Object>} Document metadata
     */
    async getDocumentMetadata(documentId, options = {}) {
        const { includeSystemMetadata = false, includeFileProperties = true, includeExifData = false } = options;

        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            const metadata = {
                documentInfo: document.documentInfo,
                fileDetails: includeFileProperties ? document.fileDetails : {
                    originalName: document.fileDetails.originalName,
                    mimeType: document.fileDetails.mimeType,
                    size: document.fileDetails.size
                },
                classification: document.documentInfo.classification,
                keywords: document.documentInfo.keywords,
                createdAt: document.createdAt,
                updatedAt: document.updatedAt
            };

            if (includeSystemMetadata) {
                metadata.system = {
                    id: document._id,
                    documentId: document.documentId,
                    tenantId: document.tenantId,
                    clientId: document.clientId,
                    storage: document.storage,
                    lifecycle: document.lifecycle,
                    versioning: document.versioning
                };
            }

            if (includeExifData && this.#isImage(document.fileDetails.mimeType)) {
                try {
                    const fileBuffer = await this.#getDocumentContent(document);
                    metadata.exif = await this.#extractExifData(fileBuffer);
                } catch (error) {
                    logger.warn('Failed to extract EXIF data', {
                        documentId,
                        error: error.message
                    });
                }
            }

            return metadata;
        } catch (error) {
            logger.error('Error getting document metadata', {
                error: error.message,
                documentId
            });
            throw error;
        }
    }

    /**
     * Update document metadata
     * @param {string} documentId - Document ID
     * @param {Object} metadata - Metadata updates
     * @param {string} userId - User updating metadata
     * @returns {Promise<Object>} Updated metadata
     */
    async updateDocumentMetadata(documentId, metadata, userId) {
        try {
            // Get document
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkDocumentAccess(document, userId, 'write');

            // Validate and prepare metadata updates
            const updateFields = {};

            if (metadata.title || metadata.name) {
                updateFields['documentInfo.name'] = metadata.title || metadata.name;
            }
            if (metadata.description) {
                updateFields['documentInfo.description'] = metadata.description;
            }
            if (metadata.keywords && Array.isArray(metadata.keywords)) {
                updateFields['documentInfo.keywords'] = metadata.keywords;
            }
            if (metadata.category) {
                updateFields['documentInfo.category'] = metadata.category;
            }
            if (metadata.classification) {
                updateFields['documentInfo.classification'] = metadata.classification;
            }

            // Custom metadata fields
            if (metadata.custom && typeof metadata.custom === 'object') {
                updateFields['metadata.custom'] = metadata.custom;
            }

            // Update document
            const updatedDocument = await ClientDocumentModel.findByIdAndUpdate(
                documentId,
                {
                    $set: {
                        ...updateFields,
                        'metadata.lastModifiedBy': userId,
                        'metadata.lastModifiedAt': new Date()
                    }
                },
                { new: true }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'DOCUMENT_METADATA_UPDATED',
                entityType: 'client_document',
                entityId: documentId,
                userId,
                details: { updatedFields: Object.keys(updateFields) }
            });

            return {
                documentInfo: updatedDocument.documentInfo,
                metadata: updatedDocument.metadata,
                updatedAt: updatedDocument.updatedAt
            };
        } catch (error) {
            logger.error('Error updating document metadata', {
                error: error.message,
                documentId,
                userId
            });
            throw error;
        }
    }

    /**
     * Bulk delete documents
     * @param {Array} documentIds - Array of document IDs
     * @param {string} userId - User performing deletion
     * @param {Object} options - Deletion options
     * @returns {Promise<Object>} Bulk deletion result
     */
    async bulkDeleteDocuments(documentIds, userId, options = {}) {
        const { permanent = false, reason } = options;
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            const results = {
                successful: [],
                failed: [],
                total: documentIds.length
            };

            // Process each document
            for (const [index, documentId] of documentIds.entries()) {
                try {
                    await this.deleteDocument(documentId, userId, { permanent, session });
                    results.successful.push({
                        index,
                        documentId,
                        status: permanent ? 'permanently_deleted' : 'deleted'
                    });
                } catch (error) {
                    results.failed.push({
                        index,
                        documentId,
                        error: error.message
                    });
                }
            }

            await session.commitTransaction();

            // Log bulk operation
            await this.#auditService.log({
                action: 'BULK_DOCUMENTS_DELETED',
                entityType: 'client_document',
                userId,
                details: {
                    total: results.total,
                    successful: results.successful.length,
                    failed: results.failed.length,
                    permanent,
                    reason
                }
            });

            return results;
        } catch (error) {
            await session.abortTransaction();
            logger.error('Error in bulk document deletion', {
                error: error.message,
                documentIds: documentIds.length,
                userId
            });
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Clean up expired documents
     * @param {Object} options - Cleanup options
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanupExpiredDocuments(options = {}) {
        const { dryRun = false, batchSize = 100, maxAge = null, tenantId = null } = options;

        try {
            const cleanupResult = {
                processed: 0,
                deleted: 0,
                errors: [],
                startTime: new Date()
            };

            // Build query for expired documents
            const query = {
                isDeleted: false,
                'lifecycle.status': { $in: ['expired', 'archived'] }
            };

            if (tenantId) query.tenantId = tenantId;

            if (maxAge) {
                const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);
                query.createdAt = { $lt: cutoffDate };
            }

            // Process in batches
            let hasMore = true;
            let skip = 0;

            while (hasMore) {
                const documents = await ClientDocumentModel.find(query)
                    .skip(skip)
                    .limit(batchSize)
                    .select('_id documentInfo.name clientId');

                if (documents.length === 0) {
                    hasMore = false;
                    break;
                }

                for (const document of documents) {
                    try {
                        cleanupResult.processed++;

                        if (!dryRun) {
                            // Permanently delete expired documents
                            await this.deleteDocument(document._id, 'system', { permanent: true });
                            cleanupResult.deleted++;
                        }
                    } catch (error) {
                        cleanupResult.errors.push({
                            documentId: document._id,
                            error: error.message
                        });
                    }
                }

                skip += batchSize;
            }

            cleanupResult.endTime = new Date();
            cleanupResult.duration = cleanupResult.endTime - cleanupResult.startTime;

            logger.info('Document cleanup completed', cleanupResult);

            return cleanupResult;
        } catch (error) {
            logger.error('Error in document cleanup', {
                error: error.message,
                options
            });
            throw error;
        }
    }

    // ==================== Additional Private Helper Methods ====================

    /**
     * Delete file from storage
     * @private
     */
    async #deleteFromStorage(document) {
        try {
            await this.#fileService.delete(document.storage.location, {
                provider: document.storage.provider
            });
        } catch (error) {
            logger.error('Error deleting file from storage', {
                error: error.message,
                documentId: document._id,
                location: document.storage.location
            });
            // Don't throw - continue with database deletion even if storage fails
        }
    }

    /**
     * Generate summary report
     * @private
     */
    async #generateSummaryReport(query, options) {
        return await ClientDocumentModel.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalDocuments: { $sum: 1 },
                    totalSize: { $sum: '$fileDetails.size' },
                    avgSize: { $avg: '$fileDetails.size' },
                    documentsByType: {
                        $push: {
                            type: '$documentInfo.type',
                            size: '$fileDetails.size'
                        }
                    }
                }
            }
        ]);
    }

    /**
     * Generate detailed report
     * @private
     */
    async #generateDetailedReport(query, options) {
        return await ClientDocumentModel.find(query)
            .populate('clientId', 'companyName')
            .select('documentInfo fileDetails lifecycle analytics createdAt')
            .sort({ createdAt: -1 });
    }

    /**
     * Generate compliance report
     * @private
     */
    async #generateComplianceReport(query, options) {
        return await ClientDocumentModel.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$documentInfo.classification.level',
                    count: { $sum: 1 },
                    encrypted: {
                        $sum: {
                            $cond: ['$storage.encryption.enabled', 1, 0]
                        }
                    },
                    retentionApplied: {
                        $sum: {
                            $cond: [{ $ne: ['$lifecycle.retention', null] }, 1, 0]
                        }
                    }
                }
            }
        ]);
    }

    /**
     * Generate usage report
     * @private
     */
    async #generateUsageReport(query, options) {
        return await ClientDocumentModel.aggregate([
            { $match: query },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    uploads: { $sum: 1 },
                    totalViews: { $sum: '$analytics.views.total' },
                    totalDownloads: { $sum: '$analytics.downloads.total' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);
    }

    /**
     * Generate PDF report
     * @private
     */
    async #generatePDFReport(reportData) {
        // Implement PDF generation using PDFKit or similar
        const doc = new PDFDocument();
        const buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => { });

        doc.fontSize(20).text('Document Report', 100, 100);
        doc.fontSize(12).text(JSON.stringify(reportData, null, 2), 100, 150);

        doc.end();

        return Buffer.concat(buffers);
    }

    /**
     * Create document backup
     * @private
     */
    async #createDocumentBackup(document, fileBuffer) {
        try {
            const backupFileName = `${document._id}_backup_${Date.now()}`;

            await this.#uploadToStorage(
                { buffer: fileBuffer, checksum: document.fileDetails.checksum },
                document.storage.provider,
                {
                    clientId: document.clientId,
                    fileName: `backups/${backupFileName}`,
                    encrypt: document.storage.encryption.enabled
                }
            );

            logger.debug('Document backup created', {
                documentId: document._id,
                backupFileName
            });
        } catch (error) {
            logger.error('Error creating document backup', {
                error: error.message,
                documentId: document._id
            });
            // Don't throw - backup creation failure shouldn't stop optimization
        }
    }

    /**
     * Optimize image
     * @private
     */
    async #optimizeImage(imageBuffer, options) {
        const { compressionLevel = 'medium', preserveQuality = true } = options;

        try {
            const qualityMap = {
                low: 60,
                medium: 80,
                high: 90
            };

            const quality = preserveQuality ? qualityMap.high : qualityMap[compressionLevel];

            return await sharp(imageBuffer)
                .jpeg({ quality })
                .toBuffer();
        } catch (error) {
            logger.error('Error optimizing image', { error: error.message });
            return imageBuffer; // Return original if optimization fails
        }
    }

    /**
     * Optimize PDF
     * @private
     */
    async #optimizePDF(pdfBuffer, options) {
        // Implement PDF optimization
        // This would require a PDF processing library
        return pdfBuffer; // Return original for now
    }

    /**
     * Generate PDF preview
     * @private
     */
    async #generatePDFPreview(pdfBuffer, pageNumber) {
        // Implement PDF to image conversion
        // This would require libraries like pdf-poppler or pdf2pic
        return Buffer.alloc(0); // Placeholder
    }

    /**
     * Extract EXIF data from image
     * @private
     */
    async #extractExifData(imageBuffer) {
        try {
            // Implement EXIF extraction using exif-reader or similar
            return {
                extracted: false,
                message: 'EXIF extraction not implemented'
            };
        } catch (error) {
            logger.error('Error extracting EXIF data', { error: error.message });
            return null;
        }
    }

    /**
     * Get document activity and history
     * @param {string} documentId - Document ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Document activity
     */
    async getDocumentActivity(documentId, options = {}) {
        const {
            page = 1,
            limit = 50,
            dateRange = { start: moment().subtract(30, 'days').toDate(), end: new Date() },
            activityTypes = null
        } = options;

        try {
            // Get document to verify access
            const document = await ClientDocumentModel.findById(documentId);
            if (!document) {
                throw new NotFoundError('Document not found', 'DOCUMENT_NOT_FOUND');
            }

            // Build activity query from multiple sources
            const activities = [];

            // Get audit trail activities
            const auditQuery = {
                entityType: 'client_document',
                entityId: documentId,
                timestamp: { $gte: dateRange.start, $lte: dateRange.end }
            };

            if (activityTypes && activityTypes.length > 0) {
                auditQuery.action = { $in: activityTypes };
            }

            const auditActivities = await this.#auditService.query(auditQuery, {
                sort: { timestamp: -1 }
            });

            // Transform audit activities
            activities.push(...auditActivities.map(audit => ({
                id: audit._id,
                type: 'audit',
                action: audit.action,
                timestamp: audit.timestamp,
                userId: audit.userId,
                details: audit.details,
                source: 'audit_log'
            })));

            // Get document view/download activities from analytics
            if (document.analytics?.views?.history) {
                activities.push(...document.analytics.views.history.map(view => ({
                    id: `view_${view.timestamp}`,
                    type: 'view',
                    action: 'DOCUMENT_VIEWED',
                    timestamp: view.timestamp,
                    userId: view.userId,
                    details: { ip: view.ip, userAgent: view.userAgent },
                    source: 'analytics'
                })));
            }

            if (document.analytics?.downloads?.history) {
                activities.push(...document.analytics.downloads.history.map(download => ({
                    id: `download_${download.timestamp}`,
                    type: 'download',
                    action: 'DOCUMENT_DOWNLOADED',
                    timestamp: download.timestamp,
                    userId: download.userId,
                    details: { format: download.format, size: download.size },
                    source: 'analytics'
                })));
            }

            // Sort all activities by timestamp
            activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Apply pagination
            const skip = (page - 1) * limit;
            const paginatedActivities = activities.slice(skip, skip + limit);

            return {
                activities: paginatedActivities,
                pagination: {
                    page,
                    limit,
                    total: activities.length,
                    totalPages: Math.ceil(activities.length / limit),
                    hasMore: skip + paginatedActivities.length < activities.length
                }
            };
        } catch (error) {
            logger.error('Error getting document activity', {
                error: error.message,
                documentId
            });
            throw error;
        }
    }

    /**
     * Get storage statistics
     * @param {string} clientId - Client ID (optional)
     * @param {Object} options - Statistics options
     * @returns {Promise<Object>} Storage statistics
     */
    async getStorageStatistics(clientId = null, options = {}) {
        const {
            tenantId,
            includeBreakdown = true,
            includeProjections = false,
            dateRange = { start: moment().subtract(30, 'days').toDate(), end: new Date() }
        } = options;

        try {
            const query = {
                isDeleted: false
            };

            if (clientId) query.clientId = clientId;
            if (tenantId) query.tenantId = tenantId;

            // Get overall statistics
            const overallStats = await ClientDocumentModel.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: null,
                        totalDocuments: { $sum: 1 },
                        totalSize: { $sum: '$fileDetails.size' },
                        avgSize: { $avg: '$fileDetails.size' },
                        maxSize: { $max: '$fileDetails.size' },
                        minSize: { $min: '$fileDetails.size' }
                    }
                }
            ]);

            const stats = overallStats[0] || {
                totalDocuments: 0,
                totalSize: 0,
                avgSize: 0,
                maxSize: 0,
                minSize: 0
            };

            const result = {
                overview: {
                    totalDocuments: stats.totalDocuments,
                    totalSize: stats.totalSize,
                    averageSize: Math.round(stats.avgSize || 0),
                    largestDocument: stats.maxSize,
                    smallestDocument: stats.minSize,
                    storageUsedGB: (stats.totalSize / (1024 * 1024 * 1024)).toFixed(2)
                },
                limits: {
                    storageLimit: 1000000000000, // 1TB default
                    documentLimit: 100000,
                    usagePercentage: ((stats.totalSize / 1000000000000) * 100).toFixed(2)
                }
            };

            if (includeBreakdown) {
                // Get breakdown by file type
                const typeBreakdown = await ClientDocumentModel.aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: '$fileDetails.fileExtension',
                            count: { $sum: 1 },
                            totalSize: { $sum: '$fileDetails.size' }
                        }
                    },
                    { $sort: { totalSize: -1 } }
                ]);

                // Get breakdown by classification
                const classificationBreakdown = await ClientDocumentModel.aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: '$documentInfo.classification.level',
                            count: { $sum: 1 },
                            totalSize: { $sum: '$fileDetails.size' }
                        }
                    }
                ]);

                // Get monthly usage trend
                const usageTrend = await ClientDocumentModel.aggregate([
                    {
                        $match: {
                            ...query,
                            createdAt: { $gte: dateRange.start, $lte: dateRange.end }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                year: { $year: '$createdAt' },
                                month: { $month: '$createdAt' }
                            },
                            documentsAdded: { $sum: 1 },
                            storageAdded: { $sum: '$fileDetails.size' }
                        }
                    },
                    { $sort: { '_id.year': 1, '_id.month': 1 } }
                ]);

                result.breakdown = {
                    byFileType: typeBreakdown,
                    byClassification: classificationBreakdown,
                    usageTrend
                };
            }

            if (includeProjections) {
                // Calculate storage projections based on recent usage
                const recentUsage = result.breakdown?.usageTrend?.slice(-6) || [];
                if (recentUsage.length > 0) {
                    const avgMonthlyGrowth = recentUsage.reduce((sum, month) =>
                        sum + month.storageAdded, 0) / recentUsage.length;

                    result.projections = {
                        nextMonth: stats.totalSize + avgMonthlyGrowth,
                        next3Months: stats.totalSize + (avgMonthlyGrowth * 3),
                        next6Months: stats.totalSize + (avgMonthlyGrowth * 6),
                        yearEnd: stats.totalSize + (avgMonthlyGrowth * 12),
                        monthlyGrowthRate: avgMonthlyGrowth
                    };
                }
            }

            return result;
        } catch (error) {
            logger.error('Error getting storage statistics', {
                error: error.message,
                clientId,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Validate and sanitize permissions
     * @private
     */
    async #validateAndSanitizePermissions(permissions, document) {
        const sanitized = {
            users: [],
            groups: [],
            roles: [],
            public: null,
            restrictions: {},
            inheritance: { enabled: false }
        };

        // Process user permissions
        if (permissions.users && Array.isArray(permissions.users)) {
            for (const userPerm of permissions.users) {
                // Verify user exists (you would integrate with your user service)
                const userExists = await this.#verifyUserExists(userPerm.userId);
                if (!userExists) {
                    logger.warn('Skipping permission for non-existent user', {
                        userId: userPerm.userId,
                        documentId: document._id
                    });
                    continue;
                }

                // Sanitize permissions
                const cleanPermissions = {};
                const validPermissions = ['read', 'write', 'delete', 'share', 'admin'];

                for (const perm of validPermissions) {
                    if (userPerm.permissions[perm] === true) {
                        cleanPermissions[perm] = true;
                    }
                }

                // Ensure logical permission hierarchy
                if (cleanPermissions.admin) {
                    cleanPermissions.read = true;
                    cleanPermissions.write = true;
                    cleanPermissions.delete = true;
                    cleanPermissions.share = true;
                } else if (cleanPermissions.delete || cleanPermissions.share) {
                    cleanPermissions.read = true;
                    cleanPermissions.write = true;
                } else if (cleanPermissions.write) {
                    cleanPermissions.read = true;
                }

                sanitized.users.push({
                    userId: userPerm.userId,
                    permissions: cleanPermissions,
                    grantedBy: userPerm.grantedBy,
                    grantedAt: userPerm.grantedAt || new Date(),
                    expiresAt: userPerm.expiresAt ? new Date(userPerm.expiresAt) : null,
                    notes: userPerm.notes || '',
                    notifications: userPerm.notifications || {
                        onShare: true,
                        onUpdate: false,
                        onDelete: true
                    }
                });
            }
        }

        // Process group permissions
        if (permissions.groups && Array.isArray(permissions.groups)) {
            for (const groupPerm of permissions.groups) {
                // Verify group exists
                const groupExists = await this.#verifyGroupExists(groupPerm.groupId);
                if (!groupExists) {
                    logger.warn('Skipping permission for non-existent group', {
                        groupId: groupPerm.groupId,
                        documentId: document._id
                    });
                    continue;
                }

                sanitized.groups.push({
                    groupId: groupPerm.groupId,
                    permissions: groupPerm.permissions,
                    grantedBy: groupPerm.grantedBy,
                    grantedAt: groupPerm.grantedAt || new Date(),
                    expiresAt: groupPerm.expiresAt ? new Date(groupPerm.expiresAt) : null
                });
            }
        }

        // Process role permissions
        if (permissions.roles && Array.isArray(permissions.roles)) {
            const validRoles = ['admin', 'manager', 'user', 'viewer', 'auditor'];

            for (const rolePerm of permissions.roles) {
                if (validRoles.includes(rolePerm.role)) {
                    sanitized.roles.push({
                        role: rolePerm.role,
                        permissions: rolePerm.permissions,
                        grantedBy: rolePerm.grantedBy,
                        grantedAt: rolePerm.grantedAt || new Date()
                    });
                }
            }
        }

        // Process public permissions
        if (permissions.public) {
            sanitized.public = {
                enabled: permissions.public.enabled === true,
                permissions: permissions.public.permissions || { read: true },
                requiresRegistration: permissions.public.requiresRegistration === true,
                allowedDomains: permissions.public.allowedDomains || [],
                expiresAt: permissions.public.expiresAt ? new Date(permissions.public.expiresAt) : null
            };
        }

        // Process restrictions
        if (permissions.restrictions) {
            sanitized.restrictions = {
                downloadDisabled: permissions.restrictions.downloadDisabled === true,
                viewLimit: permissions.restrictions.viewLimit || null,
                ipRestrictions: permissions.restrictions.ipRestrictions || [],
                timeRestrictions: permissions.restrictions.timeRestrictions || null,
                watermark: permissions.restrictions.watermark || { enabled: false },
                deviceRestrictions: permissions.restrictions.deviceRestrictions || { enabled: false }
            };
        }

        // Process inheritance settings
        if (permissions.inheritance) {
            sanitized.inheritance = {
                enabled: permissions.inheritance.enabled === true,
                source: permissions.inheritance.source || 'parent',
                overrides: permissions.inheritance.overrides || []
            };
        }

        return sanitized;
    }

    /**
     * Identify users affected by permission changes
     * @private
     */
    async #identifyAffectedUsers(originalPermissions, updatedPermissions) {
        const affectedUsers = new Set();

        // Check removed users
        if (originalPermissions.users) {
            for (const originalUser of originalPermissions.users) {
                const stillHasAccess = updatedPermissions.users.some(
                    user => user.userId.toString() === originalUser.userId.toString()
                );

                if (!stillHasAccess) {
                    affectedUsers.add({
                        userId: originalUser.userId,
                        changeType: 'removed',
                        oldPermissions: originalUser.permissions,
                        newPermissions: null
                    });
                }
            }
        }

        // Check added/modified users
        for (const updatedUser of updatedPermissions.users) {
            const originalUser = originalPermissions.users?.find(
                user => user.userId.toString() === updatedUser.userId.toString()
            );

            if (!originalUser) {
                // New user added
                affectedUsers.add({
                    userId: updatedUser.userId,
                    changeType: 'added',
                    oldPermissions: null,
                    newPermissions: updatedUser.permissions
                });
            } else {
                // Check if permissions changed
                const permissionsChanged = JSON.stringify(originalUser.permissions) !==
                    JSON.stringify(updatedUser.permissions);

                if (permissionsChanged) {
                    affectedUsers.add({
                        userId: updatedUser.userId,
                        changeType: 'modified',
                        oldPermissions: originalUser.permissions,
                        newPermissions: updatedUser.permissions
                    });
                }
            }
        }

        return Array.from(affectedUsers);
    }

    /**
     * Send permission change notifications
     * @private
     */
    async #sendPermissionChangeNotifications(document, affectedUsers, updatedBy, reason) {
        try {
            const client = await ClientModel.findById(document.clientId);

            for (const affectedUser of affectedUsers) {
                try {
                    let notificationType = '';
                    let message = '';

                    switch (affectedUser.changeType) {
                        case 'added':
                            notificationType = 'document_access_granted';
                            message = `You have been granted access to document "${document.documentInfo.name}"`;
                            break;
                        case 'removed':
                            notificationType = 'document_access_revoked';
                            message = `Your access to document "${document.documentInfo.name}" has been revoked`;
                            break;
                        case 'modified':
                            notificationType = 'document_permissions_changed';
                            message = `Your permissions for document "${document.documentInfo.name}" have been updated`;
                            break;
                    }

                    // Send in-app notification
                    await this.#notificationService.send({
                        type: notificationType,
                        recipient: affectedUser.userId,
                        data: {
                            documentName: document.documentInfo.name,
                            documentId: document._id,
                            clientName: client?.companyName,
                            changeType: affectedUser.changeType,
                            oldPermissions: affectedUser.oldPermissions,
                            newPermissions: affectedUser.newPermissions,
                            updatedBy,
                            reason,
                            message
                        }
                    });

                    // Send email notification for significant changes
                    if (affectedUser.changeType === 'removed' ||
                        (affectedUser.changeType === 'added' && affectedUser.newPermissions.admin)) {

                        await this.#emailService.sendTemplate('document-permission-change', {
                            recipientId: affectedUser.userId,
                            data: {
                                documentName: document.documentInfo.name,
                                clientName: client?.companyName,
                                changeType: affectedUser.changeType,
                                reason,
                                message
                            }
                        });
                    }

                } catch (error) {
                    logger.error('Error sending permission change notification', {
                        error: error.message,
                        userId: affectedUser.userId,
                        documentId: document._id
                    });
                    // Continue with other notifications
                }
            }

            logger.debug('Permission change notifications sent', {
                documentId: document._id,
                recipientCount: affectedUsers.length
            });

        } catch (error) {
            logger.error('Error sending permission change notifications', {
                error: error.message,
                documentId: document._id
            });
            // Don't throw - notifications are not critical
        }
    }

    /**
     * Calculate permission changes for audit trail
     * @private
     */
    async #calculatePermissionChanges(originalPermissions, updatedPermissions) {
        const changes = {
            usersAdded: 0,
            usersRemoved: 0,
            usersModified: 0,
            groupsAdded: 0,
            groupsRemoved: 0,
            restrictionsChanged: false,
            publicAccessChanged: false
        };

        // Calculate user changes
        const originalUserIds = new Set(
            (originalPermissions.users || []).map(u => u.userId.toString())
        );
        const updatedUserIds = new Set(
            updatedPermissions.users.map(u => u.userId.toString())
        );

        changes.usersAdded = updatedUserIds.size -
            new Set([...originalUserIds].filter(id => updatedUserIds.has(id))).size;

        changes.usersRemoved = originalUserIds.size -
            new Set([...updatedUserIds].filter(id => originalUserIds.has(id))).size;

        // Count modified users
        for (const updatedUser of updatedPermissions.users) {
            const originalUser = (originalPermissions.users || []).find(
                u => u.userId.toString() === updatedUser.userId.toString()
            );

            if (originalUser &&
                JSON.stringify(originalUser.permissions) !== JSON.stringify(updatedUser.permissions)) {
                changes.usersModified++;
            }
        }

        // Check restrictions changes
        changes.restrictionsChanged = JSON.stringify(originalPermissions.restrictions || {}) !==
            JSON.stringify(updatedPermissions.restrictions || {});

        // Check public access changes
        changes.publicAccessChanged = JSON.stringify(originalPermissions.public || {}) !==
            JSON.stringify(updatedPermissions.public || {});

        return changes;
    }

    /**
     * Verify user exists
     * @private
     */
    async #verifyUserExists(userId) {
        try {
            // This would integrate with your user management system
            // For now, return true as placeholder
            return true;
        } catch (error) {
            logger.error('Error verifying user exists', {
                error: error.message,
                userId
            });
            return false;
        }
    }

    /**
     * Verify group exists
     * @private
     */
    async #verifyGroupExists(groupId) {
        try {
            // This would integrate with your group management system
            // For now, return true as placeholder
            return true;
        } catch (error) {
            logger.error('Error verifying group exists', {
                error: error.message,
                groupId
            });
            return false;
        }
    }
}

module.exports = ClientDocumentsService;