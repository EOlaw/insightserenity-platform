/**
 * @fileoverview Consultant Assignment Routes
 * @module servers/customer-services/modules/core-business/consultant-management/routes/consultant-assignment-routes
 * @description Express routes for consultant assignment management operations including
 * assignment CRUD, lifecycle management, approval workflow, time tracking, and reporting
 */

const express = require('express');
const router = express.Router();

const consultantAssignmentController = require('../controllers/consultant-assignment-controller');
const { ConsultantAssignmentController } = require('../controllers/consultant-assignment-controller');

// Middleware imports - adjust paths based on your project structure
const { authenticate } = require('../../../../../../shared/lib/middleware/auth-middleware');
const { authorize, checkPermission } = require('../../../../../../shared/lib/middleware/permission-middleware');
const { rateLimiter } = require('../../../../../../shared/lib/middleware/rate-limiter');

// ============================================================================
// ORGANIZATION-WIDE ASSIGNMENT ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-assignments/pending-approvals
 * @description Get pending assignment approvals
 * @access Private - Requires authentication and approve permission
 */
router.get(
    '/pending-approvals',
    authenticate,
    checkPermission('consultant-assignments', 'approve'),
    consultantAssignmentController.getPendingApprovals
);

/**
 * @route GET /api/v1/consultant-assignments/utilization-report
 * @description Get utilization report
 * @access Private - Requires authentication and reports permission
 */
router.get(
    '/utilization-report',
    authenticate,
    checkPermission('consultant-assignments', 'reports'),
    consultantAssignmentController.getUtilizationReport
);

/**
 * @route GET /api/v1/consultant-assignments/revenue-report
 * @description Get revenue report
 * @access Private - Requires authentication and reports permission
 */
router.get(
    '/revenue-report',
    authenticate,
    checkPermission('consultant-assignments', 'reports'),
    consultantAssignmentController.getRevenueReport
);

/**
 * @route GET /api/v1/consultant-assignments/statistics
 * @description Get assignment statistics
 * @access Private - Requires authentication and reports permission
 */
router.get(
    '/statistics',
    authenticate,
    checkPermission('consultant-assignments', 'reports'),
    consultantAssignmentController.getAssignmentStatistics
);

/**
 * @route GET /api/v1/consultant-assignments/me
 * @description Get current user's assignments (self-service)
 * @access Private - Requires authentication only
 */
router.get(
    '/me',
    authenticate,
    consultantAssignmentController.getMyAssignments
);

/**
 * @route POST /api/v1/consultant-assignments
 * @description Create a new assignment
 * @access Private - Requires authentication and create permission
 */
router.post(
    '/',
    authenticate,
    checkPermission('consultant-assignments', 'create'),
    ConsultantAssignmentController.createValidation(),
    consultantAssignmentController.createAssignment
);

/**
 * @route POST /api/v1/consultant-assignments/bulk
 * @description Bulk create assignments
 * @access Private - Requires authentication and create permission
 */
router.post(
    '/bulk',
    authenticate,
    checkPermission('consultant-assignments', 'create'),
    rateLimiter({ windowMs: 60000, max: 10 }),
    consultantAssignmentController.bulkCreateAssignments
);

// ============================================================================
// CONSULTANT-SPECIFIC ASSIGNMENT ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-assignments/consultant/:consultantId
 * @description Get consultant's assignments
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/consultant/:consultantId',
    authenticate,
    checkPermission('consultant-assignments', 'view'),
    ConsultantAssignmentController.listValidation(),
    consultantAssignmentController.getConsultantAssignments
);

/**
 * @route GET /api/v1/consultant-assignments/consultant/:consultantId/allocation
 * @description Get current allocation for a consultant
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/consultant/:consultantId/allocation',
    authenticate,
    checkPermission('consultant-assignments', 'view'),
    consultantAssignmentController.getCurrentAllocation
);

// ============================================================================
// PROJECT-SPECIFIC ASSIGNMENT ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-assignments/project/:projectId
 * @description Get project assignments
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/project/:projectId',
    authenticate,
    checkPermission('consultant-assignments', 'view'),
    consultantAssignmentController.getProjectAssignments
);

// ============================================================================
// CLIENT-SPECIFIC ASSIGNMENT ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-assignments/client/:clientId
 * @description Get client assignments
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/client/:clientId',
    authenticate,
    checkPermission('consultant-assignments', 'view'),
    consultantAssignmentController.getClientAssignments
);

// ============================================================================
// INDIVIDUAL ASSIGNMENT ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-assignments/:assignmentId
 * @description Get assignment by ID
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/:assignmentId',
    authenticate,
    checkPermission('consultant-assignments', 'view'),
    consultantAssignmentController.getAssignmentById
);

/**
 * @route PUT /api/v1/consultant-assignments/:assignmentId
 * @description Update assignment
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:assignmentId',
    authenticate,
    checkPermission('consultant-assignments', 'update'),
    ConsultantAssignmentController.updateValidation(),
    consultantAssignmentController.updateAssignment
);

/**
 * @route DELETE /api/v1/consultant-assignments/:assignmentId
 * @description Delete assignment (soft delete by default)
 * @access Private - Requires authentication and delete permission
 */
router.delete(
    '/:assignmentId',
    authenticate,
    checkPermission('consultant-assignments', 'delete'),
    consultantAssignmentController.deleteAssignment
);

/**
 * @route POST /api/v1/consultant-assignments/:assignmentId/extend
 * @description Extend assignment
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:assignmentId/extend',
    authenticate,
    checkPermission('consultant-assignments', 'update'),
    ConsultantAssignmentController.extendValidation(),
    consultantAssignmentController.extendAssignment
);

// ============================================================================
// LIFECYCLE MANAGEMENT ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultant-assignments/:assignmentId/start
 * @description Start assignment
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:assignmentId/start',
    authenticate,
    checkPermission('consultant-assignments', 'manage'),
    consultantAssignmentController.startAssignment
);

/**
 * @route POST /api/v1/consultant-assignments/:assignmentId/complete
 * @description Complete assignment
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:assignmentId/complete',
    authenticate,
    checkPermission('consultant-assignments', 'manage'),
    consultantAssignmentController.completeAssignment
);

/**
 * @route POST /api/v1/consultant-assignments/:assignmentId/cancel
 * @description Cancel assignment
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:assignmentId/cancel',
    authenticate,
    checkPermission('consultant-assignments', 'manage'),
    consultantAssignmentController.cancelAssignment
);

/**
 * @route POST /api/v1/consultant-assignments/:assignmentId/hold
 * @description Put assignment on hold
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:assignmentId/hold',
    authenticate,
    checkPermission('consultant-assignments', 'manage'),
    consultantAssignmentController.holdAssignment
);

/**
 * @route POST /api/v1/consultant-assignments/:assignmentId/resume
 * @description Resume assignment from hold
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:assignmentId/resume',
    authenticate,
    checkPermission('consultant-assignments', 'manage'),
    consultantAssignmentController.resumeAssignment
);

// ============================================================================
// APPROVAL WORKFLOW ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultant-assignments/:assignmentId/approve
 * @description Approve assignment
 * @access Private - Requires authentication and approve permission
 */
router.post(
    '/:assignmentId/approve',
    authenticate,
    checkPermission('consultant-assignments', 'approve'),
    consultantAssignmentController.approveAssignment
);

/**
 * @route POST /api/v1/consultant-assignments/:assignmentId/reject
 * @description Reject assignment
 * @access Private - Requires authentication and approve permission
 */
router.post(
    '/:assignmentId/reject',
    authenticate,
    checkPermission('consultant-assignments', 'approve'),
    consultantAssignmentController.rejectAssignment
);

// ============================================================================
// TIME TRACKING ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultant-assignments/:assignmentId/time-log
 * @description Log time for assignment
 * @access Private - Requires authentication and log-time permission
 */
router.post(
    '/:assignmentId/time-log',
    authenticate,
    checkPermission('consultant-assignments', 'log-time'),
    ConsultantAssignmentController.timeLogValidation(),
    consultantAssignmentController.logTime
);

module.exports = router;