/**
 * @fileoverview Client Management Routes Index
 * @module servers/customer-services/modules/core-business/client-management/routes/index
 * @description Main route configuration for client management module
 */

const express = require('express');
const router = express.Router();

// Import route modules
const clientRoutes = require('./client-routes');
const clientContactRoutes = require('./client-contact-routes');
const clientDocumentRoutes = require('./client-document-routes');
const clientNoteRoutes = require('./client-note-routes');

// Import controllers for nested routes
const ClientContactController = require('../controllers/client-contact-controller');
const ClientDocumentController = require('../controllers/client-document-controller');
const ClientNoteController = require('../controllers/client-note-controller');

// Import middleware
const { authenticate } = require('../../../../middleware/auth-middleware');
const { checkPermission } = require('../../../../middleware/permissions');
const { rateLimiter } = require('../../../../middleware/rate-limiter');

/**
 * Mount main route modules
 * Note: clientRoutes is mounted at '/' because this router is already mounted at '/clients' in app.js
 */
// router.use('/', clientRoutes);
router.use('/contacts', clientContactRoutes);
router.use('/documents', clientDocumentRoutes);
router.use('/notes', clientNoteRoutes);
router.use('/', clientRoutes);

/**
 * Nested routes for client-specific resources
 * These allow accessing contacts, documents, and notes via /clients/:clientId/...
 */

// Apply authentication middleware
router.use(authenticate);

/**
 * @route   GET /api/v1/clients/:clientId/contacts
 * @desc    Get all contacts for a specific client
 * @access  Private
 */
router.get(
    '/clients/:clientId/contacts',
    checkPermission('contacts:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientContactController.getContactsByClient
);

/**
 * @route   GET /api/v1/clients/:clientId/documents
 * @desc    Get all documents for a specific client
 * @access  Private
 */
router.get(
    '/clients/:clientId/documents',
    checkPermission('documents:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientDocumentController.getDocumentsByClient
);

/**
 * @route   GET /api/v1/clients/:clientId/notes
 * @desc    Get all notes for a specific client
 * @access  Private
 */
router.get(
    '/clients/:clientId/notes',
    checkPermission('notes:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.getNotesByClient
);

/**
 * Health check route for the client management module
 */
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        module: 'client-management',
        status: 'operational',
        timestamp: new Date().toISOString(),
        routes: {
            clients: '/api/v1/clients/',
            contacts: '/api/v1/clients/contacts',
            documents: '/api/v1/clients/documents',
            notes: '/api/v1/clients/notes'
        }
    });
});

/**
 * API documentation endpoint
 */
router.get('/docs', (req, res) => {
    res.status(200).json({
        success: true,
        module: 'client-management',
        version: '1.0.0',
        description: 'Client Management API',
        endpoints: {
            clients: {
                base: '/api/v1/clients/',
                operations: [
                    'POST /api/v1/clients/ - Create client',
                    'GET /api/v1/clients/:id - Get client by ID',
                    'GET /api/v1/clients/code/:code - Get client by code',
                    'PUT /api/v1/clients/:id - Update client',
                    'DELETE /api/v1/clients/:id - Delete client',
                    'GET /api/v1/clients/search - Search clients',
                    'GET /api/v1/clients/statistics - Get statistics',
                    'POST /api/v1/clients/bulk - Bulk create clients',
                    'GET /api/v1/clients/export - Export clients'
                ]
            },
            contacts: {
                base: '/api/v1/clients/contacts',
                operations: [
                    'POST /api/v1/clients/contacts - Create contact',
                    'GET /api/v1/clients/contacts/:id - Get contact by ID',
                    'PUT /api/v1/clients/contacts/:id - Update contact',
                    'DELETE /api/v1/clients/contacts/:id - Delete contact',
                    'GET /api/v1/clients/contacts/search - Search contacts',
                    'POST /api/v1/clients/contacts/:id/interactions - Record interaction',
                    'GET /api/v1/clients/contacts/:id/engagement - Get engagement metrics',
                    'POST /api/v1/clients/contacts/bulk - Bulk create contacts',
                    'GET /api/v1/clients/contacts/export - Export contacts'
                ]
            },
            documents: {
                base: '/api/v1/clients/documents',
                operations: [
                    'POST /api/v1/clients/documents - Create/upload document',
                    'GET /api/v1/clients/documents/:id - Get document by ID',
                    'PUT /api/v1/clients/documents/:id - Update document',
                    'DELETE /api/v1/clients/documents/:id - Delete document',
                    'GET /api/v1/clients/documents/search - Search documents',
                    'POST /api/v1/clients/documents/:id/share - Share document',
                    'GET /api/v1/clients/documents/:id/download - Download document',
                    'GET /api/v1/clients/documents/:id/versions - Get versions',
                    'GET /api/v1/clients/documents/:id/analytics - Get analytics',
                    'POST /api/v1/clients/documents/bulk - Bulk upload documents'
                ]
            },
            notes: {
                base: '/api/v1/clients/notes',
                operations: [
                    'POST /api/v1/clients/notes - Create note',
                    'GET /api/v1/clients/notes/:id - Get note by ID',
                    'PUT /api/v1/clients/notes/:id - Update note',
                    'DELETE /api/v1/clients/notes/:id - Delete note',
                    'GET /api/v1/clients/notes/search - Search notes',
                    'GET /api/v1/clients/notes/recent - Get recent notes',
                    'GET /api/v1/clients/notes/tags/:tag - Get notes by tag',
                    'GET /api/v1/clients/notes/priority/:priority - Get notes by priority',
                    'POST /api/v1/clients/notes/:id/comments - Add comment',
                    'GET /api/v1/clients/notes/statistics - Get statistics',
                    'POST /api/v1/clients/notes/bulk - Bulk create notes',
                    'GET /api/v1/clients/notes/export - Export notes'
                ]
            },
            nested: {
                description: 'Client-specific nested routes',
                operations: [
                    'GET /api/v1/clients/:clientId/contacts - Get client contacts',
                    'GET /api/v1/clients/:clientId/documents - Get client documents',
                    'GET /api/v1/clients/:clientId/notes - Get client notes'
                ]
            }
        }
    });
});

module.exports = router;