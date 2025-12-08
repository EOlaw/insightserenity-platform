/**
 * @fileoverview Consultant Availability Routes
 * @module servers/customer-services/modules/core-business/consultant-management/routes/consultant-availability-routes
 * @description Express routes for consultant availability management operations including
 * availability records, time-off requests, capacity planning, and approval workflow
 */

const express = require('express');
const router = express.Router();

const consultantAvailabilityController = require('../controllers/consultant-availability-controller');
const { ConsultantAvailabilityController } = require('../controllers/consultant-availability-controller');

// Middleware imports - adjust paths based on your project structure
const { authenticate } = require('../../../../../../shared/lib/middleware/auth-middleware');
const { authorize, checkPermission } = require('../../../../../../shared/lib/middleware/permission-middleware');
const { rateLimiter } = require('../../../../../../shared/lib/middleware/rate-limiter');

// ============================================================================
// ORGANIZATION-WIDE AVAILABILITY ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-availability/available
 * @description Find available consultants for a date range
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/available',
    authenticate,
    checkPermission('consultant-availability', 'view'),
    ConsultantAvailabilityController.findAvailableValidation(),
    consultantAvailabilityController.findAvailableConsultants
);

/**
 * @route POST /api/v1/consultant-availability/bulk
 * @description Get availability for multiple consultants
 * @access Private - Requires authentication and view permission
 */
router.post(
    '/bulk',
    authenticate,
    checkPermission('consultant-availability', 'view'),
    consultantAvailabilityController.getBulkConsultantAvailability
);

/**
 * @route GET /api/v1/consultant-availability/pending-approvals
 * @description Get pending time-off requests for approval
 * @access Private - Requires authentication and approve permission
 */
router.get(
    '/pending-approvals',
    authenticate,
    checkPermission('consultant-availability', 'approve'),
    consultantAvailabilityController.getPendingTimeOffRequests
);

/**
 * @route GET /api/v1/consultant-availability/capacity-report
 * @description Get capacity report
 * @access Private - Requires authentication and reports permission
 */
router.get(
    '/capacity-report',
    authenticate,
    checkPermission('consultant-availability', 'reports'),
    consultantAvailabilityController.getCapacityReport
);

/**
 * @route GET /api/v1/consultant-availability/statistics
 * @description Get availability statistics
 * @access Private - Requires authentication and reports permission
 */
router.get(
    '/statistics',
    authenticate,
    checkPermission('consultant-availability', 'reports'),
    consultantAvailabilityController.getAvailabilityStatistics
);

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
// CONSULTANT-SPECIFIC AVAILABILITY ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-availability/consultant/:consultantId
 * @description Get consultant's availability records
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
 * @route POST /api/v1/consultant-availability/consultant/:consultantId
 * @description Create a new availability record
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
 * @description Create a time-off request
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
 * @route POST /api/v1/consultant-availability/consultant/:consultantId/bulk
 * @description Bulk create availability records
 * @access Private - Requires authentication and create permission
 */
router.post(
    '/consultant/:consultantId/bulk',
    authenticate,
    checkPermission('consultant-availability', 'create'),
    rateLimiter({ windowMs: 60000, max: 10 }),
    consultantAvailabilityController.bulkCreateAvailability
);

/**
 * @route GET /api/v1/consultant-availability/consultant/:consultantId/capacity
 * @description Get consultant capacity for a date range
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/consultant/:consultantId/capacity',
    authenticate,
    checkPermission('consultant-availability', 'view'),
    consultantAvailabilityController.getConsultantCapacity
);

/**
 * @route GET /api/v1/consultant-availability/consultant/:consultantId/conflicts
 * @description Check for conflicts with existing availability
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
 * @description Get time-off balance for consultant
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/consultant/:consultantId/time-off-balance',
    authenticate,
    checkPermission('consultant-availability', 'view'),
    consultantAvailabilityController.getTimeOffBalance
);

// ============================================================================
// INDIVIDUAL AVAILABILITY RECORD ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-availability/:availabilityId
 * @description Get availability record by ID
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/:availabilityId',
    authenticate,
    checkPermission('consultant-availability', 'view'),
    consultantAvailabilityController.getAvailabilityById
);

/**
 * @route PUT /api/v1/consultant-availability/:availabilityId
 * @description Update availability record
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
 * @description Delete availability record (soft delete by default)
 * @access Private - Requires authentication and delete permission
 */
router.delete(
    '/:availabilityId',
    authenticate,
    checkPermission('consultant-availability', 'delete'),
    consultantAvailabilityController.deleteAvailability
);

// ============================================================================
// TIME-OFF APPROVAL WORKFLOW ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultant-availability/:availabilityId/approve
 * @description Approve time-off request
 * @access Private - Requires authentication and approve permission
 */
router.post(
    '/:availabilityId/approve',
    authenticate,
    checkPermission('consultant-availability', 'approve'),
    consultantAvailabilityController.approveTimeOff
);

/**
 * @route POST /api/v1/consultant-availability/:availabilityId/reject
 * @description Reject time-off request
 * @access Private - Requires authentication and approve permission
 */
router.post(
    '/:availabilityId/reject',
    authenticate,
    checkPermission('consultant-availability', 'approve'),
    consultantAvailabilityController.rejectTimeOff
);

/**
 * @route POST /api/v1/consultant-availability/:availabilityId/cancel
 * @description Cancel time-off request
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:availabilityId/cancel',
    authenticate,
    checkPermission('consultant-availability', 'update'),
    consultantAvailabilityController.cancelTimeOff
);

module.exports = router;