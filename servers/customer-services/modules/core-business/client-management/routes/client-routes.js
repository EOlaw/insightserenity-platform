/**
 * @fileoverview Client Self-Service Routes
 * @module servers/customer-services/modules/core-business/client-management/routes/client-routes
 * @description Client-facing routes for authenticated clients to manage their own data
 * @note Administrative operations are handled by the admin server
 */

const express = require('express');
const router = express.Router();
const ClientController = require('../controllers/client-controller');

// Import middleware
const { authenticate } = require('../../../../middleware/auth-middleware');
const { validateRequest } = require('../../../../middleware/validation');
const { rateLimiter } = require('../../../../middleware/rate-limiter');

// Apply authentication to all routes
// Note: Permission checks removed - clients access their own data only
// Authorization is enforced at the controller level
router.use(authenticate);

/**
 * @route   GET /api/v1/clients/statistics
 * @desc    Get client's own statistics
 * @access  Private (Authenticated Client)
 * @note    Returns statistics for the authenticated client only
 */
router.get(
    '/statistics',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientController.getStatistics
);

/**
 * @route   GET /api/v1/clients/code/:code
 * @desc    Get client by code
 * @access  Private (Authenticated Client)
 * @note    Client can only retrieve their own record
 */
router.get(
    '/code/:code',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientController.getClientByCode
);

/**
 * @route   GET /api/v1/clients/:id/dashboard
 * @desc    Get client dashboard data
 * @access  Private (Authenticated Client)
 * @note    Returns dashboard data for the authenticated client only
 */
router.get(
    '/:id/dashboard',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientController.getClientDashboard
);

/**
 * @route   GET /api/v1/clients/:id
 * @desc    Get client profile by ID
 * @access  Private (Authenticated Client)
 * @note    Client can only retrieve their own record
 */
router.get(
    '/:id',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientController.getClientById
);

/**
 * @route   PUT /api/v1/clients/:id
 * @desc    Update client profile (full update)
 * @access  Private (Authenticated Client)
 * @note    Client can only update their own record
 */
router.put(
    '/:id',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientController.updateClient
);

/**
 * @route   PATCH /api/v1/clients/:id
 * @desc    Update client profile (partial update)
 * @access  Private (Authenticated Client)
 * @note    Client can only update their own record
 */
router.patch(
    '/:id',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientController.updateClient
);

// ============================================================================
// REMOVED ROUTES - These operations are handled by the admin server
// ============================================================================

// POST /api/v1/clients - Client creation is an administrative function
// POST /api/v1/clients/bulk - Bulk operations are administrative only
// GET /api/v1/clients/export - Export functionality is administrative only
// GET /api/v1/clients/search - Search across clients is administrative only
// POST /api/v1/clients/search - Advanced search is administrative only
// DELETE /api/v1/clients/:id - Client deletion is administrative only

module.exports = router;