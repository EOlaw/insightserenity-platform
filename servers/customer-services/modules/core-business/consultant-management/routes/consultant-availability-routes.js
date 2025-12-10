/**
 * @fileoverview Consultant Availability Routes - Customer Services
 * @module servers/customer-services/modules/core-business/consultant-management/routes/consultant-availability-routes
 * @description Express routes for consultant availability self-service and peer viewing operations.
 * Administrative operations (organization-wide searches, bulk operations, approval workflows, capacity planning)
 * have been moved to admin-server.
 */

const express = require('express');
const router = express.Router();

const consultantAvailabilityController = require('../controllers/consultant-availability-controller');
const { ConsultantAvailabilityController } = require('../controllers/consultant-availability-controller');

// Middleware imports
const { authenticate } = require('../../../../../../shared/lib/middleware/auth-middleware');
const { checkPermission } = require('../../../../../../shared/lib/middleware/permission-middleware');

// ============================================================================
// SELF-SERVICE AVAILABILITY ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-availability/me
 * @description Get current user's availability (self-service)
 * @access Private - Requires authentication only
 */
router.get(
    '/me',
    authenticate,
    consultantAvailabilityController.getMyAvailability
);

// ============================================================================
// PEER VIEWING ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-availability/consultant/:consultantId
 * @description Get consultant's availability records (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/consultant/:consultantId',
    authenticate,
    checkPermission('consultant-availability', 'view'),
    ConsultantAvailabilityController.listValidation(),
    consultantAvailabilityController.getConsultantAvailability
);

/**
 * @route GET /api/v1/consultant-availability/consultant/:consultantId/capacity
 * @description Get consultant capacity for a date range (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/consultant/:consultantId/capacity',
    authenticate,
    checkPermission('consultant-availability', 'view'),
    consultantAvailabilityController.getConsultantCapacity
);

/**
 * @route GET /api/v1/consultant-availability/:availabilityId
 * @description Get availability record by ID (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/:availabilityId',
    authenticate,
    checkPermission('consultant-availability', 'view'),
    consultantAvailabilityController.getAvailabilityById
);

// ============================================================================
// SELF-SERVICE AVAILABILITY MANAGEMENT
// ============================================================================

/**
 * @route POST /api/v1/consultant-availability/consultant/:consultantId
 * @description Create a new availability record (self-service)
 * @access Private - Requires authentication and create permission
 */
router.post(
    '/consultant/:consultantId',
    authenticate,
    checkPermission('consultant-availability', 'create'),
    ConsultantAvailabilityController.createValidation(),
    consultantAvailabilityController.createAvailability
);

/**
 * @route POST /api/v1/consultant-availability/consultant/:consultantId/time-off
 * @description Create a time-off request (self-service)
 * @access Private - Requires authentication and create permission
 */
router.post(
    '/consultant/:consultantId/time-off',
    authenticate,
    checkPermission('consultant-availability', 'create'),
    ConsultantAvailabilityController.timeOffValidation(),
    consultantAvailabilityController.createTimeOffRequest
);

/**
 * @route GET /api/v1/consultant-availability/consultant/:consultantId/conflicts
 * @description Check for conflicts with existing availability (self-service)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/consultant/:consultantId/conflicts',
    authenticate,
    checkPermission('consultant-availability', 'view'),
    consultantAvailabilityController.checkConflicts
);

/**
 * @route GET /api/v1/consultant-availability/consultant/:consultantId/time-off-balance
 * @description Get time-off balance for consultant (self-service)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/consultant/:consultantId/time-off-balance',
    authenticate,
    checkPermission('consultant-availability', 'view'),
    consultantAvailabilityController.getTimeOffBalance
);

/**
 * @route PUT /api/v1/consultant-availability/:availabilityId
 * @description Update availability record (self-service)
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:availabilityId',
    authenticate,
    checkPermission('consultant-availability', 'update'),
    ConsultantAvailabilityController.updateValidation(),
    consultantAvailabilityController.updateAvailability
);

/**
 * @route DELETE /api/v1/consultant-availability/:availabilityId
 * @description Delete availability record (self-service, soft delete by default)
 * @access Private - Requires authentication and delete permission
 */
router.delete(
    '/:availabilityId',
    authenticate,
    checkPermission('consultant-availability', 'delete'),
    consultantAvailabilityController.deleteAvailability
);

/**
 * @route POST /api/v1/consultant-availability/:availabilityId/cancel
 * @description Cancel time-off request (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:availabilityId/cancel',
    authenticate,
    checkPermission('consultant-availability', 'update'),
    consultantAvailabilityController.cancelTimeOff
);

module.exports = router;

/*
 * REMOVED ROUTES - Moved to Admin-Server:
 * 
 * ORGANIZATION-WIDE AVAILABILITY MANAGEMENT:
 * - GET /api/v1/consultant-availability/available - Find available consultants for date range (administrative)
 * - POST /api/v1/consultant-availability/bulk - Get availability for multiple consultants (administrative)
 * 
 * APPROVAL WORKFLOW:
 * - GET /api/v1/consultant-availability/pending-approvals - Get pending time-off requests (administrative)
 * - POST /api/v1/consultant-availability/:availabilityId/approve - Approve time-off request (administrative)
 * - POST /api/v1/consultant-availability/:availabilityId/reject - Reject time-off request (administrative)
 * 
 * CAPACITY PLANNING & ANALYTICS:
 * - GET /api/v1/consultant-availability/capacity-report - Get capacity report (administrative)
 * - GET /api/v1/consultant-availability/statistics - Get availability statistics (administrative)
 * 
 * BULK OPERATIONS:
 * - POST /api/v1/consultant-availability/consultant/:consultantId/bulk - Bulk create availability records (administrative)
 * 
 * Note: Consultants can manage their own availability, request time off, and cancel their own requests.
 * Approval workflows and organization-wide capacity planning require administrative access through admin-server.
 */