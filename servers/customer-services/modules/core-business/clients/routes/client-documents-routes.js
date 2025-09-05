'use strict';

/**
 * @fileoverview Comprehensive client document management routes with workflow automation
 * @module servers/customer-services/modules/core-business/clients/routes/client-documents-routes
 * @requires express
 * @requires module:servers/customer-services/modules/core-business/clients/controllers/client-documents-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/validation/file-validator
 * @requires module:shared/lib/utils/logger
 * @requires multer
 */

const express = require('express');
const multer = require('multer');
const router = express.Router({ mergeParams: true }); // Important: mergeParams to access parent route params
const ClientDocumentsController = require('../controllers/client-documents-controller');
// const ClientDocumentsValidators = require('../validators/client-documents-validators');
// const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');
// const {
//   createLimiter,
//   limitByIP,
//   limitByUser,
//   limitByEndpoint,
//   combinedLimit,
//   customLimit,
//   costBasedLimit,
//   adaptiveLimit
// } = require('../../../../../shared/lib/auth/middleware/rate-limit');
// const { requestSanitizer } = require('../../../../../shared/lib/middleware/security/request-sanitizer');
// const { middleware: auditMiddleware, logEvent: auditLogEvent } = require('../../../../../shared/lib/middleware/logging/audit-logger');
// const { validate: fileValidator } = require('../../../../../shared/lib/middleware/validation/file-validator');
// const logger = require('../../../../../shared/lib/utils/logger');

/**
 * Multer configuration for document uploads
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 10 // Max 10 files for bulk upload
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'text/csv',
      'application/zip',
      'application/x-zip-compressed'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload supported document formats.'));
    }
  }
});

/**
 * Advanced rate limiting configurations for document operations
 */
const RATE_LIMITS = {
  // Default rate limiting
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many document requests, please try again later.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Document read operations
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,
    message: 'Document read rate limit exceeded.',
    headers: true
  },
  
  // Document upload operations
  upload: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: 'Document upload rate limit exceeded.',
    headers: true
  },
  
  // Document download operations
  download: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50,
    message: 'Document download rate limit exceeded.',
    headers: true
  },
  
  // Bulk operations
  bulk: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 15000,
    message: 'Bulk document operation limit exceeded.',
    headers: true
  },
  
  // Workflow operations
  workflow: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 20,
    message: 'Document workflow rate limit exceeded.',
    headers: true
  },
  
  // Version operations
  version: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 30,
    message: 'Document version rate limit exceeded.',
    headers: true
  },
  
  // Signature operations
  signature: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Document signature rate limit exceeded.',
    headers: true
  },
  
  // Analytics operations
  analytics: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 50,
    message: 'Document analytics rate limit exceeded.',
    headers: true
  }
};

/**
 * Cost calculator for document operations
 */
const calculateDocumentCost = (req) => {
  let cost = 25; // Base cost
  
  // Path-based cost calculation
  const pathCosts = {
    'bulk': 200,
    'workflow': 100,
    'signature': 150,
    'version': 50,
    'compliance': 80,
    'analytics': 70,
    'report': 100,
    'export': 80,
    'convert': 60,
    'optimize': 70
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // File-based cost calculation
  if (req.file) {
    const sizeMB = req.file.size / (1024 * 1024);
    cost += Math.ceil(sizeMB) * 10;
  }
  
  if (req.files && req.files.length > 0) {
    req.files.forEach(file => {
      const sizeMB = file.size / (1024 * 1024);
      cost += Math.ceil(sizeMB) * 8;
    });
  }
  
  // Query parameter analysis
  if (req.query) {
    if (req.query.includeContent === 'true') cost += 50;
    if (req.query.includeVersions === 'true') cost += 40;
    if (req.query.includeAuditTrail === 'true') cost += 30;
    if (req.query.includeAnalytics === 'true') cost += 35;
    
    const limit = parseInt(req.query.limit) || 20;
    if (limit > 100) cost += Math.ceil((limit - 100) / 50) * 20;
  }
  
  return Math.min(cost, 25000); // Cap at 25000
};

/**
 * Document operation logger
 */
const documentOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        clientId: req.params.clientId || req.clientContext?.clientId,
        documentId: req.params.documentId,
        userId: req.user?.id,
        userRole: req.user?.role,
        ip: req.ip,
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        fileInfo: req.file ? {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        } : null
      };

      // logger.info(`Document operation initiated: ${operation}`, operationMetadata);

      req.documentOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      // logger.error('Failed to log document operation', {
      //   operation,
      //   error: error.message
      // });
      next();
    }
  };
};

/**
 * Middleware to validate document access
 */
const validateDocumentAccess = async (req, res, next) => {
  try {
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Document-specific access rules
    const accessRules = {
      'document_read': {
        allowedRoles: ['admin', 'manager', 'user', 'viewer'],
        requiredPermissions: ['documents.read']
      },
      'document_write': {
        allowedRoles: ['admin', 'manager', 'user'],
        requiredPermissions: ['documents.create', 'documents.update']
      },
      'document_delete': {
        allowedRoles: ['admin', 'manager'],
        requiredPermissions: ['documents.delete']
      },
      'document_download': {
        allowedRoles: ['admin', 'manager', 'user', 'viewer'],
        requiredPermissions: ['documents.download']
      },
      'document_workflow': {
        allowedRoles: ['admin', 'manager'],
        requiredPermissions: ['documents.workflow']
      },
      'document_signature': {
        allowedRoles: ['admin', 'manager', 'user'],
        requiredPermissions: ['documents.signatures']
      }
    };

    // Determine required access level based on path and method
    let requiredAccess = 'document_read';
    if (req.path.includes('upload') || req.method === 'POST' || req.method === 'PUT') {
      requiredAccess = 'document_write';
    } else if (req.method === 'DELETE') {
      requiredAccess = 'document_delete';
    } else if (req.path.includes('download')) {
      requiredAccess = 'document_download';
    } else if (req.path.includes('workflow')) {
      requiredAccess = 'document_workflow';
    } else if (req.path.includes('signature')) {
      requiredAccess = 'document_signature';
    }

    const rules = accessRules[requiredAccess];
    
    if (!rules.allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient role for document operation',
        required: rules.allowedRoles
      });
    }
    
    next();
  } catch (error) {
    // logger.error('Failed to validate document access', {
    //   error: error.message
    // });
    
    return res.status(500).json({
      success: false,
      message: 'Access validation failed'
    });
  }
};

/**
 * Middleware to process document search parameters
 */
const processDocumentSearchParams = (req, res, next) => {
  try {
    // Process date parameters
    if (req.query.createdAfter) {
      req.query.createdAfter = new Date(req.query.createdAfter);
    }
    if (req.query.createdBefore) {
      req.query.createdBefore = new Date(req.query.createdBefore);
    }
    
    // Process boolean parameters
    ['includeArchived', 'includeDeleted', 'includeContent', 'includeVersions'].forEach(param => {
      if (req.query[param]) {
        req.query[param] = req.query[param] === 'true';
      }
    });
    
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid search parameters'
    });
  }
};

/**
 * ===============================================================================
 * DOCUMENT CRUD ROUTES
 * Core document management operations
 * ===============================================================================
 */

// Upload new document
router.post(
  '/upload',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.upload),
  upload.single('document'),
  // fileValidator({
  //   maxSize: 100 * 1024 * 1024, // 100MB
  //   allowedTypes: ['application/pdf', 'application/msword', 'image/jpeg', 'image/png']
  // }),
  // ClientDocumentsValidators.validateUpload,
  documentOperationLogger('document-upload'),
  ClientDocumentsController.uploadDocument
);

// Get all documents for client
router.get(
  '/',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateDocumentAccess,
  // adaptiveLimit(RATE_LIMITS.read),
  processDocumentSearchParams,
  ClientDocumentsController.getClientDocuments
);

// Search documents
router.get(
  '/search',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateDocumentAccess,
  // limitByEndpoint(RATE_LIMITS.read),
  processDocumentSearchParams,
  ClientDocumentsController.searchDocuments
);

// Get document by ID
router.get(
  '/:documentId',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientDocumentsController.getDocumentById
);

// Update document metadata
router.put(
  '/:documentId',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.default),
  // ClientDocumentsValidators.validateUpdate,
  documentOperationLogger('document-update'),
  ClientDocumentsController.updateDocument
);

// Delete document
router.delete(
  '/:documentId',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // combinedLimit(['ip', 'user'], RATE_LIMITS.default),
  documentOperationLogger('document-delete'),
  ClientDocumentsController.deleteDocument
);

// Download document
router.get(
  '/:documentId/download',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.download),
  documentOperationLogger('document-download'),
  ClientDocumentsController.downloadDocument
);

/**
 * ===============================================================================
 * DOCUMENT VERSION MANAGEMENT ROUTES
 * ===============================================================================
 */

// Create new version
router.post(
  '/:documentId/versions',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.version),
  upload.single('document'),
  // ClientDocumentsValidators.validateVersion,
  documentOperationLogger('create-version'),
  ClientDocumentsController.createDocumentVersion
);

// Get document versions
router.get(
  '/:documentId/versions',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientDocumentsController.getDocumentVersions
);

/**
 * ===============================================================================
 * DOCUMENT SHARING AND PERMISSIONS ROUTES
 * ===============================================================================
 */

// Share document
router.post(
  '/:documentId/share',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  // ClientDocumentsValidators.validateShare,
  documentOperationLogger('share-document'),
  ClientDocumentsController.shareDocument
);

// Update document permissions
router.put(
  '/:documentId/permissions',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('update-permissions'),
  ClientDocumentsController.updateDocumentPermissions
);

/**
 * ===============================================================================
 * DOCUMENT WORKFLOW ROUTES
 * ===============================================================================
 */

// Start document workflow
router.post(
  '/:documentId/workflow',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.workflow),
  // ClientDocumentsValidators.validateWorkflow,
  documentOperationLogger('start-workflow'),
  ClientDocumentsController.startDocumentWorkflow
);

// Update workflow status
router.patch(
  '/:documentId/workflow/:workflowId',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.workflow),
  documentOperationLogger('update-workflow'),
  ClientDocumentsController.updateWorkflowStatus
);

/**
 * ===============================================================================
 * DOCUMENT SIGNATURE ROUTES
 * ===============================================================================
 */

// Request signatures
router.post(
  '/:documentId/signatures/request',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.signature),
  // ClientDocumentsValidators.validateSignatureRequest,
  documentOperationLogger('request-signatures'),
  ClientDocumentsController.requestDocumentSignatures
);

// Complete signature
router.post(
  '/:documentId/signatures/:signatureId/complete',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.signature),
  documentOperationLogger('complete-signature'),
  ClientDocumentsController.completeDocumentSignature
);

/**
 * ===============================================================================
 * DOCUMENT COMPLIANCE AND RETENTION ROUTES
 * ===============================================================================
 */

// Apply retention policy
router.post(
  '/:documentId/retention',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('apply-retention'),
  ClientDocumentsController.applyRetentionPolicy
);

// Check compliance
router.get(
  '/:documentId/compliance',
  // authorize(['admin', 'manager', 'auditor']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  ClientDocumentsController.checkDocumentCompliance
);

/**
 * ===============================================================================
 * DOCUMENT ANALYTICS ROUTES
 * ===============================================================================
 */

// Get document analytics
router.get(
  '/analytics',
  // authorize(['admin', 'manager', 'analyst']),
  validateDocumentAccess,
  // costBasedLimit(calculateDocumentCost, RATE_LIMITS.analytics),
  ClientDocumentsController.getDocumentAnalytics
);

// Generate document report
router.post(
  '/report',
  // authorize(['admin', 'manager', 'analyst']),
  validateDocumentAccess,
  // costBasedLimit(calculateDocumentCost, RATE_LIMITS.analytics),
  documentOperationLogger('generate-report'),
  ClientDocumentsController.generateDocumentReport
);

// Get storage statistics
router.get(
  '/storage/statistics',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  ClientDocumentsController.getStorageStatistics
);

/**
 * ===============================================================================
 * DOCUMENT STATUS MANAGEMENT ROUTES
 * ===============================================================================
 */

// Archive document
router.post(
  '/:documentId/archive',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('archive-document'),
  ClientDocumentsController.archiveDocument
);

// Unarchive document
router.post(
  '/:documentId/unarchive',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('unarchive-document'),
  ClientDocumentsController.unarchiveDocument
);

// Lock document
router.post(
  '/:documentId/lock',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('lock-document'),
  ClientDocumentsController.lockDocument
);

// Unlock document
router.post(
  '/:documentId/unlock',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('unlock-document'),
  ClientDocumentsController.unlockDocument
);

/**
 * ===============================================================================
 * DOCUMENT TAGGING AND ORGANIZATION ROUTES
 * ===============================================================================
 */

// Tag document
router.post(
  '/:documentId/tags',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('tag-document'),
  ClientDocumentsController.tagDocument
);

// Untag document
router.delete(
  '/:documentId/tags/:tag',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('untag-document'),
  ClientDocumentsController.untagDocument
);

// Move document
router.post(
  '/:documentId/move',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('move-document'),
  ClientDocumentsController.moveDocument
);

// Copy document
router.post(
  '/:documentId/copy',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('copy-document'),
  ClientDocumentsController.copyDocument
);

/**
 * ===============================================================================
 * DOCUMENT AUDIT AND ACTIVITY ROUTES
 * ===============================================================================
 */

// Get audit trail
router.get(
  '/:documentId/audit',
  // authorize(['admin', 'manager', 'auditor']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientDocumentsController.getDocumentAuditTrail
);

// Get document activity
router.get(
  '/:documentId/activity',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientDocumentsController.getDocumentActivity
);

/**
 * ===============================================================================
 * DOCUMENT PROCESSING ROUTES
 * ===============================================================================
 */

// Generate thumbnails
router.post(
  '/:documentId/thumbnails',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('generate-thumbnails'),
  ClientDocumentsController.generateThumbnails
);

// Extract text from document
router.post(
  '/:documentId/extract-text',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('extract-text'),
  ClientDocumentsController.extractDocumentText
);

// Validate document structure
router.post(
  '/:documentId/validate',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  ClientDocumentsController.validateDocumentStructure
);

// Scan for viruses
router.post(
  '/:documentId/scan',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('scan-virus'),
  ClientDocumentsController.scanDocumentForViruses
);

// Optimize document
router.post(
  '/:documentId/optimize',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('optimize-document'),
  ClientDocumentsController.optimizeDocument
);

// Convert document format
router.post(
  '/:documentId/convert',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  // ClientDocumentsValidators.validateConversion,
  documentOperationLogger('convert-document'),
  ClientDocumentsController.convertDocumentFormat
);

/**
 * ===============================================================================
 * DOCUMENT PREVIEW AND METADATA ROUTES
 * ===============================================================================
 */

// Get document preview
router.get(
  '/:documentId/preview',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientDocumentsController.getDocumentPreview
);

// Get document metadata
router.get(
  '/:documentId/metadata',
  // authorize(['admin', 'manager', 'user', 'viewer']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.read),
  ClientDocumentsController.getDocumentMetadata
);

// Update document metadata
router.put(
  '/:documentId/metadata',
  // authorize(['admin', 'manager', 'user']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('update-metadata'),
  ClientDocumentsController.updateDocumentMetadata
);

/**
 * ===============================================================================
 * BULK DOCUMENT OPERATIONS ROUTES
 * ===============================================================================
 */

// Bulk upload documents
router.post(
  '/bulk/upload',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // costBasedLimit(calculateDocumentCost, RATE_LIMITS.bulk),
  upload.array('documents', 10),
  documentOperationLogger('bulk-upload'),
  ClientDocumentsController.bulkUploadDocuments
);

// Bulk delete documents
router.post(
  '/bulk/delete',
  // authorize(['admin', 'manager']),
  validateDocumentAccess,
  // costBasedLimit(calculateDocumentCost, RATE_LIMITS.bulk),
  documentOperationLogger('bulk-delete'),
  ClientDocumentsController.bulkDeleteDocuments
);

/**
 * ===============================================================================
 * DOCUMENT MAINTENANCE ROUTES
 * ===============================================================================
 */

// Cleanup expired documents
router.post(
  '/maintenance/cleanup',
  // authorize(['admin']),
  validateDocumentAccess,
  // limitByUser(RATE_LIMITS.default),
  documentOperationLogger('cleanup-expired'),
  ClientDocumentsController.cleanupExpiredDocuments
);

/**
 * ===============================================================================
 * ERROR HANDLING MIDDLEWARE
 * ===============================================================================
 */
router.use((err, req, res, next) => {
  const errorContext = {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    clientId: req.params?.clientId || req.clientContext?.clientId,
    documentId: req.params?.documentId,
    documentOperation: req.documentOperationContext?.operation,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    fileInfo: req.file || req.files
  };

  // logger.error('Document route error', errorContext);

  // Special handling for multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds maximum allowed size',
        maxSize: '100MB'
      }
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'TOO_MANY_FILES',
        message: 'Too many files uploaded',
        maxFiles: 10
      }
    });
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'DOCUMENT_ERROR',
      message: err.message || 'Document operation failed',
      timestamp: new Date().toISOString(),
      ...(isDevelopment && {
        stack: err.stack,
        details: err.details
      })
    }
  });
});

module.exports = router;