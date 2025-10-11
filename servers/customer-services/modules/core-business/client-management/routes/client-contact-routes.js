/**
 * @fileoverview Client Contact Management Routes
 * @module servers/customer-services/modules/core-business/client-management/routes/client-contact-routes
 * @description Routes for client contact operations
 */

const express = require('express');
const router = express.Router();
const ClientContactController = require('../controllers/client-contact-controller');

// Import middleware
const { authenticate } = require('../../../../middleware/auth-middleware');
const { validateRequest } = require('../../../../middleware/validation');
const { rateLimiter } = require('../../../../middleware/rate-limiter');
const { checkPermission } = require('../../../../middleware/permissions');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/v1/contacts/search
 * @desc    Search contacts (GET method)
 * @access  Private
 */
router.get(
    '/search',
    checkPermission('contacts:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientContactController.searchContacts
);

/**
 * @route   POST /api/v1/contacts/search
 * @desc    Search contacts (POST method with advanced filters)
 * @access  Private
 */
router.post(
    '/search',
    checkPermission('contacts:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientContactController.searchContacts
);

/**
 * @route   GET /api/v1/contacts/export
 * @desc    Export contacts
 * @access  Private
 */
router.get(
    '/export',
    checkPermission('contacts:export'),
    rateLimiter({ maxRequests: 10, windowMs: 60000 }),
    ClientContactController.exportContacts
);

/**
 * @route   POST /api/v1/contacts/bulk
 * @desc    Bulk create contacts
 * @access  Private
 */
router.post(
    '/bulk',
    checkPermission('contacts:create'),
    rateLimiter({ maxRequests: 10, windowMs: 60000 }),
    ClientContactController.bulkCreateContacts
);

/**
 * @route   POST /api/v1/contacts
 * @desc    Create a new contact
 * @access  Private
 */
router.post(
    '/',
    checkPermission('contacts:create'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientContactController.createContact
);

/**
 * @route   GET /api/v1/contacts/:id
 * @desc    Get contact by ID
 * @access  Private
 */
router.get(
    '/:id',
    checkPermission('contacts:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientContactController.getContactById
);

/**
 * @route   PUT /api/v1/contacts/:id
 * @desc    Update contact (full update)
 * @access  Private
 */
router.put(
    '/:id',
    checkPermission('contacts:update'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientContactController.updateContact
);

/**
 * @route   PATCH /api/v1/contacts/:id
 * @desc    Update contact (partial update)
 * @access  Private
 */
router.patch(
    '/:id',
    checkPermission('contacts:update'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientContactController.updateContact
);

/**
 * @route   DELETE /api/v1/contacts/:id
 * @desc    Delete contact
 * @access  Private
 */
router.delete(
    '/:id',
    checkPermission('contacts:delete'),
    rateLimiter({ maxRequests: 20, windowMs: 60000 }),
    ClientContactController.deleteContact
);

/**
 * @route   POST /api/v1/contacts/:id/interactions
 * @desc    Record contact interaction
 * @access  Private
 */
router.post(
    '/:id/interactions',
    checkPermission('contacts:update'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientContactController.recordInteraction
);

/**
 * @route   GET /api/v1/contacts/:id/engagement
 * @desc    Get contact engagement metrics
 * @access  Private
 */
router.get(
    '/:id/engagement',
    checkPermission('contacts:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientContactController.getContactEngagement
);

module.exports = router;