/**
 * @fileoverview Client Document Self-Service Routes
 * @module servers/customer-services/modules/core-business/client-management/routes/client-document-routes
 * @description Client-facing routes for authenticated clients to manage their own documents
 * @note Administrative operations are handled by the admin server
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');
const crypto = require('crypto');
const ClientDocumentController = require('../controllers/client-document-controller');

// Import middleware
const { authenticate } = require('../../../../middleware/auth-middleware');
const { rateLimiter } = require('../../../../middleware/rate-limiter');

// Configure AWS S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Configure multer to upload directly to S3
const storage = multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_BUCKET || 'company-documents',
    acl: 'private', // Files are private by default, accessed via pre-signed URLs
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
        cb(null, {
            fieldName: file.fieldname,
            originalName: file.originalname,
            uploadedBy: req.user?.id?.toString() || 'unknown',
            uploadedAt: new Date().toISOString()
        });
    },
    key: function (req, file, cb) {
        // Generate organized S3 key structure
        const category = req.body.documentInfo?.category?.primary || 'general';
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
        const fileExtension = path.extname(file.originalname).toLowerCase();
        const sanitizedBaseName = path.basename(file.originalname, fileExtension)
            .replace(/[^a-zA-Z0-9-]/g, '_')
            .substring(0, 50); // Limit base name length
        
        const fileName = `${sanitizedBaseName}-${uniqueSuffix}${fileExtension}`;
        const s3Key = `${category}/${year}/${month}/${fileName}`;
        
        cb(null, s3Key);
    }
});

// File filter for allowed types
const fileFilter = (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_DOCUMENT_TYPES || 
        'pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv,jpg,jpeg,png,gif,zip').split(',');
    
    const fileExtension = path.extname(file.originalname).toLowerCase().replace('.', '');
    
    if (allowedTypes.includes(fileExtension)) {
        cb(null, true);
    } else {
        cb(new Error(`File type .${fileExtension} is not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
};

// Configure multer with S3 storage, limits, and filters
const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_DOCUMENT_SIZE, 10) || 104857600, // 100MB default
        files: 1 // Only allow single file upload per request
    },
    fileFilter: fileFilter
});

// Enhanced multer error handling middleware
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            const maxSizeMB = ((parseInt(process.env.MAX_DOCUMENT_SIZE, 10) || 104857600) / (1024 * 1024)).toFixed(2);
            return res.status(413).json({
                success: false,
                error: {
                    message: `File size exceeds maximum allowed size of ${maxSizeMB}MB`,
                    code: 'FILE_TOO_LARGE',
                    maxSize: maxSizeMB + 'MB'
                }
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Too many files uploaded. Only one file allowed per request',
                    code: 'TOO_MANY_FILES'
                }
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Unexpected file field. Use "file" field for document upload',
                    code: 'UNEXPECTED_FILE_FIELD'
                }
            });
        }
        return res.status(400).json({
            success: false,
            error: {
                message: 'File upload error: ' + err.message,
                code: 'UPLOAD_ERROR'
            }
        });
    }
    
    // Handle S3 upload errors
    if (err && err.name === 'NoSuchBucket') {
        return res.status(500).json({
            success: false,
            error: {
                message: 'Storage bucket not found. Please contact support.',
                code: 'STORAGE_ERROR'
            }
        });
    }
    
    if (err && err.name === 'AccessDenied') {
        return res.status(500).json({
            success: false,
            error: {
                message: 'Storage access denied. Please contact support.',
                code: 'STORAGE_ACCESS_ERROR'
            }
        });
    }
    
    if (err) {
        return res.status(400).json({
            success: false,
            error: {
                message: err.message,
                code: 'INVALID_FILE'
            }
        });
    }
    
    next();
};

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/v1/clients/documents
 * @desc    Get all documents for authenticated client
 * @access  Private (Authenticated Client)
 * @note    Client can only retrieve their own documents
 * @query   status - Filter by document status (active, archived, deleted)
 * @query   type - Filter by document type (contract, invoice, report, etc.)
 * @query   search - Search term for title or description
 * @query   sortBy - Field to sort by (default: createdAt)
 * @query   sortOrder - Sort order: asc or desc (default: desc)
 * @query   limit - Number of documents per page (max 100, default: 50)
 * @query   skip - Number of documents to skip for pagination (default: 0)
 * @query   includeDeleted - Include soft-deleted
 */
router.get(
    '/',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    // TODO: Add multer middleware in production
    // upload.single('file'),
    ClientDocumentController.getDocuments
);

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