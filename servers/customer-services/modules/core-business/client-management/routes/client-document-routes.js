/**
 * @fileoverview Client Document Management Routes
 * @module servers/customer-services/modules/core-business/client-management/routes/client-document-routes
 * @description Routes for client document operations
 */

const express = require('express');
const router = express.Router();
const ClientDocumentController = require('../controllers/client-document-controller');

// Import middleware
const { authenticate } = require('../../../../../../shared/lib/middleware/auth');
const { validateRequest } = require('../../../../../../shared/lib/middleware/validation');
const { rateLimiter } = require('../../../../../../shared/lib/middleware/rate-limiter');
const { checkPermission } = require('../../../../../../shared/lib/middleware/permissions');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/v1/documents/search
 * @desc    Search documents (GET method)
 * @access  Private
 */
router.get(
    '/search',
    checkPermission('documents:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientDocumentController.searchDocuments
);

/**
 * @route   POST /api/v1/documents/search
 * @desc    Search documents (POST method with advanced filters)
 * @access  Private
 */
router.post(
    '/search',
    checkPermission('documents:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientDocumentController.searchDocuments
);

/**
 * @route   POST /api/v1/documents/bulk
 * @desc    Bulk upload documents
 * @access  Private
 */
router.post(
    '/bulk',
    checkPermission('documents:create'),
    rateLimiter({ maxRequests: 5, windowMs: 60000 }),
    ClientDocumentController.bulkUploadDocuments
);

/**
 * @route   POST /api/v1/documents
 * @desc    Create/upload a new document
 * @access  Private
 */
router.post(
    '/',
    checkPermission('documents:create'),
    rateLimiter({ maxRequests: 30, windowMs: 60000 }),
    // Note: In production, add multer middleware here for file uploads
    // upload.single('file'),
    ClientDocumentController.createDocument
);

/**
 * @route   GET /api/v1/documents/:id
 * @desc    Get document by ID
 * @access  Private
 */
router.get(
    '/:id',
    checkPermission('documents:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientDocumentController.getDocumentById
);

/**
 * @route   PUT /api/v1/documents/:id
 * @desc    Update document (full update)
 * @access  Private
 */
router.put(
    '/:id',
    checkPermission('documents:update'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientDocumentController.updateDocument
);

/**
 * @route   PATCH /api/v1/documents/:id
 * @desc    Update document (partial update)
 * @access  Private
 */
router.patch(
    '/:id',
    checkPermission('documents:update'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientDocumentController.updateDocument
);

/**
 * @route   DELETE /api/v1/documents/:id
 * @desc    Delete document
 * @access  Private
 */
router.delete(
    '/:id',
    checkPermission('documents:delete'),
    rateLimiter({ maxRequests: 20, windowMs: 60000 }),
    ClientDocumentController.deleteDocument
);

/**
 * @route   POST /api/v1/documents/:id/share
 * @desc    Share document with users
 * @access  Private
 */
router.post(
    '/:id/share',
    checkPermission('documents:share'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientDocumentController.shareDocument
);

/**
 * @route   GET /api/v1/documents/:id/download
 * @desc    Download document
 * @access  Private
 */
router.get(
    '/:id/download',
    checkPermission('documents:read'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientDocumentController.downloadDocument
);

/**
 * @route   GET /api/v1/documents/:id/versions
 * @desc    Get document versions
 * @access  Private
 */
router.get(
    '/:id/versions',
    checkPermission('documents:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientDocumentController.getDocumentVersions
);

/**
 * @route   GET /api/v1/documents/:id/analytics
 * @desc    Get document analytics
 * @access  Private
 */
router.get(
    '/:id/analytics',
    checkPermission('documents:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientDocumentController.getDocumentAnalytics
);

module.exports = router;