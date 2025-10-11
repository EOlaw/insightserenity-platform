/**
 * @fileoverview Client Management Routes
 * @module servers/customer-services/modules/core-business/client-management/routes/client-routes
 * @description Routes for client operations
 */

const express = require('express');
const router = express.Router();
const ClientController = require('../controllers/client-controller');

// Import middleware
const { authenticate } = require('../../../../middleware/auth-middleware');
const { validateRequest } = require('../../../../middleware/validation');
const { rateLimiter } = require('../../../../middleware/rate-limiter');
const { checkPermission } = require('../../../../middleware/permissions');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/v1/clients/statistics
 * @desc    Get client statistics
 * @access  Private
 */
router.get(
    '/statistics',
    checkPermission('clients:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientController.getStatistics
);

/**
 * @route   GET /api/v1/clients/search
 * @desc    Search clients (GET method)
 * @access  Private
 */
router.get(
    '/search',
    checkPermission('clients:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientController.searchClients
);

/**
 * @route   POST /api/v1/clients/search
 * @desc    Search clients (POST method with advanced filters)
 * @access  Private
 */
router.post(
    '/search',
    checkPermission('clients:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientController.searchClients
);

/**
 * @route   GET /api/v1/clients/export
 * @desc    Export clients
 * @access  Private
 */
router.get(
    '/export',
    checkPermission('clients:export'),
    rateLimiter({ maxRequests: 10, windowMs: 60000 }),
    ClientController.exportClients
);

/**
 * @route   POST /api/v1/clients/bulk
 * @desc    Bulk create clients
 * @access  Private
 */
router.post(
    '/bulk',
    checkPermission('clients:create'),
    rateLimiter({ maxRequests: 10, windowMs: 60000 }),
    ClientController.bulkCreateClients
);

/**
 * @route   GET /api/v1/clients/code/:code
 * @desc    Get client by code
 * @access  Private
 */
router.get(
    '/code/:code',
    checkPermission('clients:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientController.getClientByCode
);

/**
 * @route   POST /api/v1/clients
 * @desc    Create a new client
 * @access  Private
 */
router.post(
    '/',
    checkPermission('clients:create'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientController.createClient
);

/**
 * @route   GET /api/v1/clients/:id
 * @desc    Get client by ID
 * @access  Private
 */
router.get(
    '/:id',
    checkPermission('clients:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientController.getClientById
);

/**
 * @route   PUT /api/v1/clients/:id
 * @desc    Update client (full update)
 * @access  Private
 */
router.put(
    '/:id',
    checkPermission('clients:update'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientController.updateClient
);

/**
 * @route   PATCH /api/v1/clients/:id
 * @desc    Update client (partial update)
 * @access  Private
 */
router.patch(
    '/:id',
    checkPermission('clients:update'),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    ClientController.updateClient
);

/**
 * @route   DELETE /api/v1/clients/:id
 * @desc    Delete client
 * @access  Private
 */
router.delete(
    '/:id',
    checkPermission('clients:delete'),
    rateLimiter({ maxRequests: 20, windowMs: 60000 }),
    ClientController.deleteClient
);

/**
 * @route   GET /api/v1/clients/:id/dashboard
 * @desc    Get client dashboard data
 * @access  Private
 */
router.get(
    '/:id/dashboard',
    checkPermission('clients:read'),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    ClientController.getClientDashboard
);

module.exports = router;