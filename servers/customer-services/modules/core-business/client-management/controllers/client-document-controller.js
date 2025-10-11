/**
 * @fileoverview Client Document Management Controller
 * @module servers/customer-services/modules/core-business/client-management/controllers/client-document-controller
 * @description HTTP request handlers for client document operations
 */

const ClientDocumentService = require('../services/client-document-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
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
            logger.info('Create document request received', {
                clientId: req.body.clientId,
                documentName: req.body.documentInfo?.name,
                userId: req.user?.id
            });

            const documentData = {
                ...req.body,
                tenantId: req.user?.tenantId || req.body.tenantId,
                organizationId: req.user?.organizationId || req.body.organizationId
            };

            // Handle file upload if present
            if (req.file) {
                documentData.file = {
                    originalName: req.file.originalname,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    path: req.file.path,
                    hash: req.file.hash || null
                };
            }

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: req.user?.id,
                uploadSource: req.body.uploadSource || 'web'
            };

            const document = await ClientDocumentService.createDocument(documentData, options);

            logger.info('Document created successfully', {
                documentId: document.documentId,
                userId: req.user?.id
            });

            res.status(201).json({
                success: true,
                message: 'Document created successfully',
                data: {
                    document
                }
            });

        } catch (error) {
            logger.error('Create document failed', {
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
            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id,
                populate: req.query.populate === 'true'
            };

            logger.info('Get document by ID request', { documentId: id, userId: req.user?.id });

            const document = await ClientDocumentService.getDocumentById(id, options);

            res.status(200).json({
                success: true,
                data: {
                    document
                }
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
            const options = {
                tenantId: req.user?.tenantId,
                type: req.query.type,
                status: req.query.status,
                projectId: req.query.projectId,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
                page: req.query.page,
                limit: req.query.limit
            };

            logger.info('Get documents by client request', {
                clientId,
                userId: req.user?.id
            });

            const documents = await ClientDocumentService.getDocumentsByClient(clientId, options);

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

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id,
                createNewVersion: req.body.createNewVersion === true
            };

            logger.info('Update document request', {
                documentId: id,
                updateFields: Object.keys(updateData),
                createNewVersion: options.createNewVersion,
                userId: req.user?.id
            });

            const document = await ClientDocumentService.updateDocument(id, updateData, options);

            logger.info('Document updated successfully', {
                documentId: id,
                userId: req.user?.id
            });

            res.status(200).json({
                success: true,
                message: 'Document updated successfully',
                data: {
                    document
                }
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
            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id,
                softDelete: req.query.soft !== 'false',
                forceDelete: req.query.force === 'true'
            };

            logger.info('Delete document request', {
                documentId: id,
                softDelete: options.softDelete,
                userId: req.user?.id
            });

            const result = await ClientDocumentService.deleteDocument(id, options);

            logger.info('Document deleted successfully', {
                documentId: id,
                deletionType: result.deletionType,
                userId: req.user?.id
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
     * Search documents
     * @route GET /api/v1/documents/search
     * @route POST /api/v1/documents/search
     */
    async searchDocuments(req, res, next) {
        try {
            const filters = req.method === 'POST' ? req.body.filters || {} : {
                clientId: req.query.clientId,
                type: req.query.type,
                status: req.query.status,
                accessLevel: req.query.accessLevel,
                search: req.query.q || req.query.search,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            const options = {
                tenantId: req.user?.tenantId,
                page: parseInt(req.query.page, 10) || 1,
                limit: parseInt(req.query.limit, 10) || 20,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            };

            logger.info('Search documents request', {
                filters,
                page: options.page,
                userId: req.user?.id
            });

            const result = await ClientDocumentService.searchDocuments(filters, options);

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Search documents failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Share document
     * @route POST /api/v1/documents/:id/share
     */
    async shareDocument(req, res, next) {
        try {
            const { id } = req.params;
            const { userIds } = req.body;

            if (!Array.isArray(userIds) || userIds.length === 0) {
                throw AppError.validation('User IDs are required for sharing');
            }

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id,
                notify: req.body.notify !== false
            };

            logger.info('Share document request', {
                documentId: id,
                userCount: userIds.length,
                userId: req.user?.id
            });

            const document = await ClientDocumentService.shareDocument(id, userIds, options);

            logger.info('Document shared successfully', {
                documentId: id,
                userCount: userIds.length,
                userId: req.user?.id
            });

            res.status(200).json({
                success: true,
                message: 'Document shared successfully',
                data: {
                    document
                }
            });

        } catch (error) {
            logger.error('Share document failed', {
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
            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Download document request', {
                documentId: id,
                userId: req.user?.id
            });

            const document = await ClientDocumentService.getDocumentById(id, options);

            if (!document.file?.path) {
                throw AppError.notFound('Document file not found');
            }

            // Set download headers
            res.setHeader('Content-Type', document.file.mimeType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${document.documentInfo.name}"`);

            // In production, this would stream the file from storage
            // For now, return document metadata
            res.status(200).json({
                success: true,
                message: 'Document download initiated',
                data: {
                    documentId: document.documentId,
                    name: document.documentInfo.name,
                    size: document.file.size,
                    mimeType: document.file.mimeType
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
            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Get document versions request', {
                documentId: id,
                userId: req.user?.id
            });

            const document = await ClientDocumentService.getDocumentById(id, options);

            res.status(200).json({
                success: true,
                data: {
                    documentId: document.documentId,
                    currentVersion: document.version,
                    versionHistory: document.versionHistory || []
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
     * Bulk upload documents
     * @route POST /api/v1/documents/bulk
     */
    async bulkUploadDocuments(req, res, next) {
        try {
            const { documents } = req.body;

            if (!Array.isArray(documents) || documents.length === 0) {
                throw AppError.validation('Invalid bulk document data');
            }

            logger.info('Bulk upload documents request', {
                count: documents.length,
                userId: req.user?.id
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: req.user?.id,
                uploadSource: 'bulk_upload'
            };

            const results = {
                success: [],
                failed: []
            };

            for (const documentData of documents) {
                try {
                    const document = await ClientDocumentService.createDocument(documentData, options);
                    results.success.push({
                        documentId: document.documentId,
                        name: document.documentInfo.name
                    });
                } catch (error) {
                    results.failed.push({
                        name: documentData.documentInfo?.name,
                        error: error.message
                    });
                }
            }

            logger.info('Bulk upload documents completed', {
                successCount: results.success.length,
                failedCount: results.failed.length,
                userId: req.user?.id
            });

            res.status(201).json({
                success: true,
                message: `Bulk document upload completed: ${results.success.length} succeeded, ${results.failed.length} failed`,
                data: results
            });

        } catch (error) {
            logger.error('Bulk upload documents failed', {
                error: error.message,
                userId: req.user?.id
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
            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Get document analytics request', {
                documentId: id,
                userId: req.user?.id
            });

            const document = await ClientDocumentService.getDocumentById(id, options);

            res.status(200).json({
                success: true,
                data: {
                    documentId: document.documentId,
                    analytics: document.analytics,
                    access: document.access
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