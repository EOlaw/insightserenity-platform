/**
 * @fileoverview Client Note Management Routes
 * @module servers/customer-services/modules/core-business/client-management/routes/client-note-routes
 * @description Routes for client note operations
 */

const express = require('express');
const router = express.Router();
const ClientNoteController = require('../controllers/client-note-controller');

// Import middleware
const { authenticate } = require('../../../../../../shared/lib/middleware/auth');
const { validateRequest } = require('../../../../../../shared/lib/middleware/validation');
const { rateLimiter } = require('../../../../../../shared/lib/middleware/rate-limiter');
const { checkPermission } = require('../../../../../../shared/lib/middleware/permissions');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/v1/notes/statistics
 * @desc    Get note statistics
 * @access  Private
 */
router.get(
    '/statistics',
    checkPermission('notes:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.getNoteStatistics
);

/**
 * @route   GET /api/v1/notes/recent
 * @desc    Get recent notes
 * @access  Private
 */
router.get(
    '/recent',
    checkPermission('notes:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.getRecentNotes
);

/**
 * @route   GET /api/v1/notes/search
 * @desc    Search notes (GET method)
 * @access  Private
 */
router.get(
    '/search',
    checkPermission('notes:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.searchNotes
);

/**
 * @route   POST /api/v1/notes/search
 * @desc    Search notes (POST method with advanced filters)
 * @access  Private
 */
router.post(
    '/search',
    checkPermission('notes:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.searchNotes
);

/**
 * @route   GET /api/v1/notes/export
 * @desc    Export notes
 * @access  Private
 */
router.get(
    '/export',
    checkPermission('notes:export'),
    rateLimiter({ maxRequests: 10, windowMs: 60000 }),
    ClientNoteController.exportNotes
);

/**
 * @route   POST /api/v1/notes/bulk
 * @desc    Bulk create notes
 * @access  Private
 */
router.post(
    '/bulk',
    checkPermission('notes:create'),
    rateLimiter({ maxRequests: 10, windowMs: 60000 }),
    ClientNoteController.bulkCreateNotes
);

/**
 * @route   GET /api/v1/notes/tags/:tag
 * @desc    Get notes by tag
 * @access  Private
 */
router.get(
    '/tags/:tag',
    checkPermission('notes:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.getNotesByTag
);

/**
 * @route   GET /api/v1/notes/priority/:priority
 * @desc    Get notes by priority
 * @access  Private
 */
router.get(
    '/priority/:priority',
    checkPermission('notes:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.getNotesByPriority
);

/**
 * @route   POST /api/v1/notes
 * @desc    Create a new note
 * @access  Private
 */
router.post(
    '/',
    checkPermission('notes:create'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.createNote
);

/**
 * @route   GET /api/v1/notes/:id
 * @desc    Get note by ID
 * @access  Private
 */
router.get(
    '/:id',
    checkPermission('notes:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.getNoteById
);

/**
 * @route   PUT /api/v1/notes/:id
 * @desc    Update note (full update)
 * @access  Private
 */
router.put(
    '/:id',
    checkPermission('notes:update'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.updateNote
);

/**
 * @route   PATCH /api/v1/notes/:id
 * @desc    Update note (partial update)
 * @access  Private
 */
router.patch(
    '/:id',
    checkPermission('notes:update'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.updateNote
);

/**
 * @route   DELETE /api/v1/notes/:id
 * @desc    Delete note
 * @access  Private
 */
router.delete(
    '/:id',
    checkPermission('notes:delete'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientNoteController.deleteNote
);

/**
 * @route   POST /api/v1/notes/:id/comments
 * @desc    Add comment to note
 * @access  Private
 */
router.post(
    '/:id/comments',
    checkPermission('notes:update'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.addComment
);

module.exports = router;