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
// Authorization is enforced at the controller and service levels
router.use(authenticate);

/**
 * @route   POST /api/v1/documents
 * @desc    Create/upload a new document
 * @access  Private (Authenticated Client)
 * @note    Client can only upload documents to their own account
 *          In production, add multer middleware here for file uploads:
 *          upload.single('file') or upload.array('files', 10)
 */
router.post(
    '/',
    rateLimiter({ maxRequests: 30, windowMs: 60000 }),
    // TODO: Add multer middleware in production
    // upload.single('file'),
    ClientDocumentController.createDocument
);

/**
 * @route   GET /api/v1/documents/:id
 * @desc    Get document by ID
 * @access  Private (Authenticated Client)
 * @note    Client can only retrieve their own documents
 *          Query parameters:
 *          - populate: boolean - Include related entities
 *          - trackView: boolean - Track document view (default: true)
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
 *          Body can include: createNewVersion: boolean
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
 *          Body can include: createNewVersion: boolean
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
 *          Query parameters:
 *          - soft: boolean - Soft delete (default: true)
 *          - force: boolean - Force hard delete (requires authorization)
 */
router.delete(
    '/:id',
    rateLimiter({ maxRequests: 20, windowMs: 60000 }),
    ClientDocumentController.deleteDocument
);

/**
 * @route   GET /api/v1/documents/:id/download
 * @desc    Download document
 * @access  Private (Authenticated Client)
 * @note    Client can only download their own documents
 *          Returns download URL or streams file content
 */
router.get(
    '/:id/download',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientDocumentController.downloadDocument
);

/**
 * @route   GET /api/v1/documents/:id/versions
 * @desc    Get document version history
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
 * @desc    Get document analytics and usage metrics
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

// The following routes have been removed as they are administrative functions:

// GET /api/v1/documents/search
// - Search across all documents (cross-client)
// - Administrative operation only

// POST /api/v1/documents/search
// - Advanced search with complex filters
// - Administrative operation only

// GET /api/v1/documents/export
// - Export documents in bulk
// - Administrative operation only

// POST /api/v1/documents/bulk
// - Bulk operations (create, update, delete)
// - Administrative operation only

// POST /api/v1/documents/:id/share
// - Share document with external users
// - Moved to admin server for compliance and audit

// POST /api/v1/documents/:id/signatures/request
// - Request electronic signatures
// - Administrative operation only

// POST /api/v1/documents/:id/approve
// - Approve document for publication
// - Administrative operation only

// GET /api/v1/documents/pending-approval
// - View documents pending approval
// - Administrative operation only

// POST /api/v1/documents/:id/classify
// - Classify document security level
// - Administrative operation only

// ============================================================================
// NOTES FOR IMPLEMENTATION
// ============================================================================

// 1. File Upload Middleware:
//    Add multer or similar middleware for handling file uploads in production
//    Example: const upload = multer({ dest: 'uploads/', limits: { fileSize: 100MB } })

// 2. Rate Limiting:
//    Current limits are conservative. Adjust based on your requirements:
//    - Upload: 30 requests/minute
//    - Download: 50 requests/minute
//    - View/Read: 100 requests/minute
//    - Modify: 50 requests/minute
//    - Delete: 20 requests/minute

// 3. Access Control:
//    All authorization is enforced at the service layer using:
//    - options.userClientId for self-service access
//    - Document ownership verification
//    - Client-document relationship validation

// 4. Error Handling:
//    All errors are caught by the controller and passed to the error handling middleware
//    Common errors:
//    - 400: Validation errors (invalid data)
//    - 401: Authentication required
//    - 403: Access forbidden (not your document)
//    - 404: Document not found
//    - 413: File too large
//    - 415: Unsupported file type

module.exports = router;