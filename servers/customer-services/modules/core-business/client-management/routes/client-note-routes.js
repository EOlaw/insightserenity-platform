/**
 * @fileoverview Client Note Self-Service Routes
 * @module servers/customer-services/modules/core-business/client-management/routes/client-note-routes
 * @description Client-facing routes for authenticated clients to manage their own notes
 * @note Administrative operations are handled by the admin server
 */

const express = require('express');
const router = express.Router();
const ClientNoteController = require('../controllers/client-note-controller');

// Import middleware
const { authenticate } = require('../../../../middleware/auth-middleware');
const { rateLimiter } = require('../../../../middleware/rate-limiter');

// Apply authentication to all routes
// Note: Permission checks removed - clients access their own data only
// Authorization is enforced at the controller level
router.use(authenticate);

/**
 * @route   POST /api/v1/notes
 * @desc    Create a new note
 * @access  Private (Authenticated Client)
 * @note    Client can only create notes associated with their account
 */
router.post(
    '/',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.createNote
);

/**
 * @route   GET /api/v1/notes/:id
 * @desc    Get note by ID
 * @access  Private (Authenticated Client)
 * @note    Client can only retrieve their own notes
 */
router.get(
    '/:id',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.getNoteById
);

/**
 * @route   PUT /api/v1/notes/:id
 * @desc    Update note (full update)
 * @access  Private (Authenticated Client)
 * @note    Client can only update their own notes
 */
router.put(
    '/:id',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.updateNote
);

/**
 * @route   PATCH /api/v1/notes/:id
 * @desc    Update note (partial update)
 * @access  Private (Authenticated Client)
 * @note    Client can only update their own notes
 */
router.patch(
    '/:id',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.updateNote
);

/**
 * @route   DELETE /api/v1/notes/:id
 * @desc    Delete note
 * @access  Private (Authenticated Client)
 * @note    Client can only delete their own notes
 */
router.delete(
    '/:id',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientNoteController.deleteNote
);

/**
 * @route   POST /api/v1/notes/:id/comments
 * @desc    Add comment to note
 * @access  Private (Authenticated Client)
 * @note    Client can only add comments to their own notes
 */
router.post(
    '/:id/comments',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.addComment
);

// ============================================================================
// REMOVED ROUTES - These operations are handled by the admin server
// ============================================================================

// GET /api/v1/notes/statistics - Statistics are administrative only
// GET /api/v1/notes/recent - Recent notes view is administrative only
// GET /api/v1/notes/search - Search across notes is administrative only
// POST /api/v1/notes/search - Advanced search is administrative only
// GET /api/v1/notes/export - Export functionality is administrative only
// POST /api/v1/notes/bulk - Bulk operations are administrative only
// GET /api/v1/notes/tags/:tag - Tag-based retrieval is administrative only
// GET /api/v1/notes/priority/:priority - Priority-based retrieval is administrative only

module.exports = router;