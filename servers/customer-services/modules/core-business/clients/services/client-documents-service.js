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
const ClientModel = require('../models/client-model');
const ClientDocumentModel = require('../models/client-document-model');
const ClientNoteModel = require('../models/client-note-model');
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
}

module.exports = ClientDocumentsService;