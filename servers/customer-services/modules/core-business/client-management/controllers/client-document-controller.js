/**
 * @fileoverview Client Document Management Controller
 * @module servers/customer-services/modules/core-business/client-management/controllers/client-document-controller
 * @description HTTP request handlers for client document operations with self-service access control
 */

const ClientDocumentService = require('../services/client-document-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const { search } = require('../routes');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-document-controller'
});

/**
 * Client Document Controller
 * @class ClientDocumentController
 */
class ClientDocumentController {
    /**
     * Create/upload a new document
     * @route POST /api/v1/documents
     */
    async createDocument(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;

            logger.info('Create document request received', {
                clientId: req.body.clientId,
                documentName: req.body.documentInfo?.name,
                documentType: req.body.documentInfo?.type,
                userId: userId,
                hasFileUpload: !!req.file,
                s3Location: req.file?.location
            });

            const documentData = req.body;

            // Parse nested JSON objects if sent as strings (common in multipart/form-data)
            if (typeof documentData.documentInfo === 'string') {
                try {
                    documentData.documentInfo = JSON.parse(documentData.documentInfo);
                } catch (parseError) {
                    logger.error('Failed to parse documentInfo JSON', {
                        error: parseError.message,
                        documentInfo: documentData.documentInfo
                    });
                    return res.status(400).json({
                        success: false,
                        error: {
                            message: 'Invalid documentInfo format. Must be valid JSON.',
                            code: 'INVALID_JSON_FORMAT'
                        }
                    });
                }
            }

            if (typeof documentData.lifecycle === 'string') {
                try {
                    documentData.lifecycle = JSON.parse(documentData.lifecycle);
                } catch (parseError) {
                    documentData.lifecycle = {};
                }
            }

            if (typeof documentData.accessControl === 'string') {
                try {
                    documentData.accessControl = JSON.parse(documentData.accessControl);
                } catch (parseError) {
                    documentData.accessControl = {};
                }
            }

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                source: req.body.source || 'web',
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip || req.connection.remoteAddress,
                uploadedFile: req.file
            };

            const document = await ClientDocumentService.createDocument(documentData, options);

            logger.info('Document created successfully', {
                documentId: document.documentId,
                storageUrl: document.storage?.url,
                userId: userId
            });

            res.status(201).json({
                success: true,
                message: 'Document created successfully',
                data: document
            });

        } catch (error) {
            logger.error('Create document failed', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id,
                s3Location: req.file?.location
            });
            next(error);
        }
    }

    /**
     * Get all documents for authenticated client
     * @route GET /api/v1/documents
     */
    async getDocuments(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;

            logger.info('Get all documents request', {
                userId: userId,
                userClientId: req.user?.clientId,
                query: req.query
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                type: req.query.type,
                status: req.query.status,
                classification: req.query.classification,
                search: req.query.search,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
                limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
                skip: req.query.skip ? parseInt(req.query.skip, 10) : undefined,
                includeDeleted: req.query.includeDeleted === 'true',
                onlyLatest: req.query.onlyLatest !== 'false'
            };

            const result = await ClientDocumentService.getDocuments(options);

            logger.info('All documents fetched successfully', {
                userId: userId,
                count: result.documents.length,
                total: result.metadata.total
            });

            res.status(200).json({
                success: true,
                data: result.documents,
                metadata: result.metadata
            });

        } catch (error) {
            logger.error('Get all documents failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get document by ID
     * @route GET /api/v1/documents/:id
     */
    async getDocumentById(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;

            logger.info('Get document by ID request', {
                documentId: id,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                populate: req.query.populate === 'true',
                includeDeleted: req.query.includeDeleted === 'true',
                trackView: req.query.trackView !== 'false'
            };

            const document = await ClientDocumentService.getDocumentById(id, options);

            logger.info('Document fetched successfully', {
                documentId: id,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: document
            });

        } catch (error) {
            logger.error('Get document by ID failed', {
                error: error.message,
                documentId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Get documents by client
     * @route GET /api/v1/clients/:clientId/documents
     */
    async getDocumentsByClient(req, res, next) {
        try {
            const { clientId } = req.params;
            const userId = req.user?._id || req.user?.id;

            logger.info('Get documents by client request', {
                clientId,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                type: req.query.type,
                status: req.query.status,
                projectId: req.query.projectId,
                classificationLevel: req.query.classificationLevel,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            };

            const documents = await ClientDocumentService.getDocumentsByClient(clientId, options);

            logger.info('Documents fetched successfully', {
                clientId,
                count: documents.length,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: {
                    documents,
                    count: documents.length
                }
            });

        } catch (error) {
            logger.error('Get documents by client failed', {
                error: error.message,
                clientId: req.params.clientId
            });
            next(error);
        }
    }

    /**
     * Update document
     * @route PUT /api/v1/documents/:id
     * @route PATCH /api/v1/documents/:id
     */
    async updateDocument(req, res, next) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            const userId = req.user?._id || req.user?.id;

            logger.info('Update document request', {
                documentId: id,
                updateFields: Object.keys(updateData),
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                createNewVersion: req.body.createNewVersion === true
            };

            const document = await ClientDocumentService.updateDocument(id, updateData, options);

            logger.info('Document updated successfully', {
                documentId: id,
                userId: userId
            });

            res.status(200).json({
                success: true,
                message: 'Document updated successfully',
                data: document
            });

        } catch (error) {
            logger.error('Update document failed', {
                error: error.message,
                documentId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Delete document
     * @route DELETE /api/v1/documents/:id
     */
    async deleteDocument(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;

            logger.info('Delete document request', {
                documentId: id,
                softDelete: req.query.soft !== 'false',
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                softDelete: req.query.soft !== 'false',
                forceDelete: req.query.force === 'true'
            };

            const result = await ClientDocumentService.deleteDocument(id, options);

            logger.info('Document deleted successfully', {
                documentId: id,
                deletionType: result.deletionType,
                userId: userId
            });

            res.status(200).json({
                success: true,
                message: 'Document deleted successfully',
                data: result
            });

        } catch (error) {
            logger.error('Delete document failed', {
                error: error.message,
                documentId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Download document
     * @route GET /api/v1/documents/:id/download
     */
    async downloadDocument(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;

            logger.info('Download document request', {
                documentId: id,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId
            };

            const result = await ClientDocumentService.downloadDocument(id, options);

            logger.info('Document download initiated', {
                documentId: id,
                userId: userId
            });

            // In production, this would stream the file or provide a signed URL
            res.status(200).json({
                success: true,
                message: 'Document available for download',
                data: {
                    documentId: result.document.documentId,
                    fileName: result.fileName,
                    downloadUrl: result.downloadUrl,
                    mimeType: result.document.fileDetails?.mimeType,
                    size: result.document.fileDetails?.size
                }
            });

        } catch (error) {
            logger.error('Download document failed', {
                error: error.message,
                documentId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Get document versions
     * @route GET /api/v1/documents/:id/versions
     */
    async getDocumentVersions(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;

            logger.info('Get document versions request', {
                documentId: id,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId
            };

            const document = await ClientDocumentService.getDocumentById(id, options);

            logger.info('Document versions fetched successfully', {
                documentId: id,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: {
                    documentId: document.documentId,
                    currentVersion: document.versioning?.versionString,
                    versionHistory: document.versioning?.versionHistory || [],
                    changeLog: document.versioning?.changeLog || []
                }
            });

        } catch (error) {
            logger.error('Get document versions failed', {
                error: error.message,
                documentId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Get document analytics
     * @route GET /api/v1/documents/:id/analytics
     */
    async getDocumentAnalytics(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;

            logger.info('Get document analytics request', {
                documentId: id,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId
            };

            const document = await ClientDocumentService.getDocumentById(id, options);

            logger.info('Document analytics fetched successfully', {
                documentId: id,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: {
                    documentId: document.documentId,
                    analytics: document.analytics,
                    accessControl: {
                        isShared: document.accessControl?.sharing?.isShared,
                        sharedWithCount: document.accessControl?.sharing?.sharedWith?.length || 0,
                        classificationLevel: document.documentInfo?.classification?.level
                    }
                }
            });

        } catch (error) {
            logger.error('Get document analytics failed', {
                error: error.message,
                documentId: req.params.id
            });
            next(error);
        }
    }
}

module.exports = new ClientDocumentController();