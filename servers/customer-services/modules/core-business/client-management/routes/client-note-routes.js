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
// Authorization is enforced at the controller and service levels
router.use(authenticate);

/**
 * @route   POST /api/v1/notes
 * @desc    Create a new note
 * @access  Private (Authenticated Client)
 * @note    Client can only create notes for their own account
 */
router.post(
    '/',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientNoteController.createNote
);

/**
 * @route   GET /api/v1/notes/:id
 * @desc    Get note by ID
 * @access  Private (Authenticated Client)
 * @note    Client can only retrieve their own notes
 *          Query parameters:
 *          - populate: boolean - Include related entities
 *          - trackView: boolean - Track note view (default: true)
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
 *          Body can include: createNewVersion: boolean
 */
router.put(
    '/:id',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientNoteController.updateNote
);

/**
 * @route   PATCH /api/v1/notes/:id
 * @desc    Update note (partial update)
 * @access  Private (Authenticated Client)
 * @note    Client can only update their own notes
 *          Body can include: createNewVersion: boolean
 */
router.patch(
    '/:id',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientNoteController.updateNote
);

/**
 * @route   DELETE /api/v1/notes/:id
 * @desc    Delete note
 * @access  Private (Authenticated Client)
 * @note    Client can only delete their own notes
 *          Query parameters:
 *          - soft: boolean - Soft delete (default: true)
 *          - force: boolean - Force hard delete (requires authorization)
 */
router.delete(
    '/:id',
    rateLimiter({ maxRequests: 30, windowMs: 60000 }),
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
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientNoteController.addComment
);

/**
 * @route   GET /api/v1/notes/:id/comments
 * @desc    Get note comments
 * @access  Private (Authenticated Client)
 * @note    Client can only view comments on their own notes
 */
router.get(
    '/:id/comments',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.getNoteComments
);

/**
 * @route   GET /api/v1/notes/:id/analytics
 * @desc    Get note analytics and usage metrics
 * @access  Private (Authenticated Client)
 * @note    Client can only view analytics for their own notes
 */
router.get(
    '/:id/analytics',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.getNoteAnalytics
);

/**
 * @route   GET /api/v1/notes/:id/action-items
 * @desc    Get note action items
 * @access  Private (Authenticated Client)
 * @note    Client can only view action items for their own notes
 */
router.get(
    '/:id/action-items',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientNoteController.getNoteActionItems
);

// ============================================================================
// REMOVED ROUTES - These operations are handled by the admin server
// ============================================================================

// The following routes have been removed as they are administrative functions:

// GET /api/v1/notes/search
// - Search across all notes (cross-client)
// - Administrative operation only

// POST /api/v1/notes/search
// - Advanced search with complex filters
// - Administrative operation only

// GET /api/v1/notes/export
// - Export notes in bulk
// - Administrative operation only

// POST /api/v1/notes/bulk
// - Bulk operations (create, update, delete)
// - Administrative operation only

// POST /api/v1/notes/:id/share
// - Share note with external users
// - Moved to admin server for compliance and audit

// POST /api/v1/notes/:id/classify
// - Auto-classify note type and category
// - Administrative operation only

// GET /api/v1/notes/pending-review
// - View notes pending review
// - Administrative operation only

// POST /api/v1/notes/:id/archive
// - Archive note permanently
// - Administrative operation only

// GET /api/v1/analytics/notes/summary
// - Get aggregate analytics across all notes
// - Administrative operation only

// GET /api/v1/analytics/notes/trends
// - Get note creation and usage trends
// - Administrative operation only

// POST /api/v1/notes/:id/ai-analyze
// - Perform AI analysis on note content
// - Administrative operation only

// GET /api/v1/clients/:clientId/notes/summary
// - Get summary statistics for client notes
// - This route is removed because clients should use the standard list endpoint
// - Admins can access this via admin server

// ============================================================================
// NOTES FOR IMPLEMENTATION
// ============================================================================

// 1. Rate Limiting:
//    Current limits are conservative. Adjust based on your requirements:
//    - Create: 50 requests/minute
//    - View/Read: 100 requests/minute
//    - Modify: 50 requests/minute
//    - Delete: 30 requests/minute
//    - Comment: 50 requests/minute

// 2. Access Control:
//    All authorization is enforced at the service layer using:
//    - options.userClientId for self-service access
//    - Note ownership verification
//    - Client-note relationship validation

// 3. Error Handling:
//    All errors are caught by the controller and passed to the error handling middleware
//    Common errors:
//    - 400: Validation errors (invalid data)
//    - 401: Authentication required
//    - 403: Access forbidden (not your note)
//    - 404: Note not found
//    - 413: Note content too large

// 4. Feature Considerations:
//    Notes are lightweight text content, so they don't need:
//    - File upload handling (unlike documents)
//    - Digital signatures
//    - Approval workflows (in client self-service)
//    However, notes can have:
//    - Comments
//    - Action items
//    - Tags
//    - Analytics

module.exports = router;