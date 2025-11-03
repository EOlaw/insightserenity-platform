/**
 * @fileoverview Client Document Self-Service Routes
 * @module servers/customer-services/modules/core-business/client-management/routes/client-document-routes
 * @description Client-facing routes for authenticated clients to manage their own documents
 * @note Administrative operations are handled by the admin server
 */

const express = require('express');
const router = express.Router();
const ClientDocumentController = require('../controllers/client-document-controller');

// Import middleware
const { authenticate } = require('../../../../middleware/auth-middleware');
const { rateLimiter } = require('../../../../middleware/rate-limiter');

// Apply authentication to all routes
// Note: Permission checks removed - clients access their own data only
// Authorization is enforced at the controller level
router.use(authenticate);

/**
 * @route   POST /api/v1/documents
 * @desc    Create/upload a new document
 * @access  Private (Authenticated Client)
 * @note    Client can only upload documents to their own account
 *          In production, add multer middleware here for file uploads
 */
router.post(
    '/',
    rateLimiter({ maxRequests: 30, windowMs: 60000 }),
    // Note: In production, add multer middleware here for file uploads
    // upload.single('file'),
    ClientDocumentController.createDocument
);

/**
 * @route   GET /api/v1/documents/:id
 * @desc    Get document by ID
 * @access  Private (Authenticated Client)
 * @note    Client can only retrieve their own documents
 */
router.get(
    '/:id',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientDocumentController.getDocumentById
);

/**
 * @route   PUT /api/v1/documents/:id
 * @desc    Update document (full update)
 * @access  Private (Authenticated Client)
 * @note    Client can only update their own documents
 */
router.put(
    '/:id',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientDocumentController.updateDocument
);

/**
 * @route   PATCH /api/v1/documents/:id
 * @desc    Update document (partial update)
 * @access  Private (Authenticated Client)
 * @note    Client can only update their own documents
 */
router.patch(
    '/:id',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientDocumentController.updateDocument
);

/**
 * @route   DELETE /api/v1/documents/:id
 * @desc    Delete document
 * @access  Private (Authenticated Client)
 * @note    Client can only delete their own documents
 */
router.delete(
    '/:id',
    rateLimiter({ maxRequests: 20, windowMs: 60000 }),
    ClientDocumentController.deleteDocument
);

/**
 * @route   POST /api/v1/documents/:id/share
 * @desc    Share document with users
 * @access  Private (Authenticated Client)
 * @note    Client can only share their own documents
 */
router.post(
    '/:id/share',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientDocumentController.shareDocument
);

/**
 * @route   GET /api/v1/documents/:id/download
 * @desc    Download document
 * @access  Private (Authenticated Client)
 * @note    Client can only download their own documents
 */
router.get(
    '/:id/download',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientDocumentController.downloadDocument
);

/**
 * @route   GET /api/v1/documents/:id/versions
 * @desc    Get document versions
 * @access  Private (Authenticated Client)
 * @note    Client can only view versions of their own documents
 */
router.get(
    '/:id/versions',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientDocumentController.getDocumentVersions
);

/**
 * @route   GET /api/v1/documents/:id/analytics
 * @desc    Get document analytics
 * @access  Private (Authenticated Client)
 * @note    Client can only view analytics for their own documents
 */
router.get(
    '/:id/analytics',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientDocumentController.getDocumentAnalytics
);

// ============================================================================
// REMOVED ROUTES - These operations are handled by the admin server
// ============================================================================

// GET /api/v1/documents/search - Search across documents is administrative only
// POST /api/v1/documents/search - Advanced search is administrative only
// POST /api/v1/documents/bulk - Bulk operations are administrative only

module.exports = router;