/**
 * @fileoverview Client Contact Self-Service Routes
 * @module servers/customer-services/modules/core-business/client-management/routes/client-contact-routes
 * @description Client-facing routes for authenticated clients to manage their own contacts
 * @note Administrative operations are handled by the admin server
 */

const express = require('express');
const router = express.Router();
const ClientContactController = require('../controllers/client-contact-controller');

// Import middleware
const { authenticate } = require('../../../../middleware/auth-middleware');
const { rateLimiter } = require('../../../../middleware/rate-limiter');

// Apply authentication to all routes
// Note: Permission checks removed - clients access their own data only
// Authorization is enforced at the controller level
router.use(authenticate);

/**
 * @route   POST /api/v1/contacts
 * @desc    Create a new contact
 * @access  Private (Authenticated Client)
 * @note    Client can only create contacts associated with their account
 */
router.post(
    '/',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientContactController.createContact
);

/**
 * @route   GET /api/v1/contacts/:id
 * @desc    Get contact by ID
 * @access  Private (Authenticated Client)
 * @note    Client can only retrieve their own contacts
 */
router.get(
    '/:id',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientContactController.getContactById
);

/**
 * @route   PUT /api/v1/contacts/:id
 * @desc    Update contact (full update)
 * @access  Private (Authenticated Client)
 * @note    Client can only update their own contacts
 */
router.put(
    '/:id',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientContactController.updateContact
);

/**
 * @route   PATCH /api/v1/contacts/:id
 * @desc    Update contact (partial update)
 * @access  Private (Authenticated Client)
 * @note    Client can only update their own contacts
 */
router.patch(
    '/:id',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientContactController.updateContact
);

/**
 * @route   DELETE /api/v1/contacts/:id
 * @desc    Delete contact
 * @access  Private (Authenticated Client)
 * @note    Client can only delete their own contacts
 */
router.delete(
    '/:id',
    rateLimiter({ maxRequests: 20, windowMs: 60000 }),
    ClientContactController.deleteContact
);

/**
 * @route   POST /api/v1/contacts/:id/interactions
 * @desc    Record contact interaction
 * @access  Private (Authenticated Client)
 * @note    Client can only record interactions for their own contacts
 */
router.post(
    '/:id/interactions',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientContactController.recordInteraction
);

/**
 * @route   GET /api/v1/contacts/:id/engagement
 * @desc    Get contact engagement metrics
 * @access  Private (Authenticated Client)
 * @note    Client can only view engagement for their own contacts
 */
router.get(
    '/:id/engagement',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientContactController.getContactEngagement
);

// ============================================================================
// REMOVED ROUTES - These operations are handled by the admin server
// ============================================================================

// GET /api/v1/contacts/search - Search across contacts is administrative only
// POST /api/v1/contacts/search - Advanced search is administrative only
// GET /api/v1/contacts/export - Export functionality is administrative only
// POST /api/v1/contacts/bulk - Bulk operations are administrative only

module.exports = router;