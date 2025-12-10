/**
 * @fileoverview Consultant Assignment Routes - Customer Services
 * @module servers/customer-services/modules/core-business/consultant-management/routes/consultant-assignment-routes
 * @description Express routes for consultant assignment viewing and time tracking operations.
 * Administrative operations (assignment creation, lifecycle management, approval workflows, reporting)
 * have been moved to admin-server.
 */

const express = require('express');
const router = express.Router();

const consultantAssignmentController = require('../controllers/consultant-assignment-controller');
const { ConsultantAssignmentController } = require('../controllers/consultant-assignment-controller');

// Middleware imports
const { authenticate } = require('../../../../../../shared/lib/middleware/auth-middleware');
const { checkPermission } = require('../../../../../../shared/lib/middleware/permission-middleware');

// ============================================================================
// SELF-SERVICE ASSIGNMENT ROUTES
// ============================================================================

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

// ============================================================================
// PEER VIEWING ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-assignments/consultant/:consultantId
 * @description Get consultant's assignments (peer view)
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
 * @description Get current allocation for a consultant (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/consultant/:consultantId/allocation',
    authenticate,
    checkPermission('consultant-assignments', 'view'),
    consultantAssignmentController.getCurrentAllocation
);

/**
 * @route GET /api/v1/consultant-assignments/project/:projectId
 * @description Get project assignments (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/project/:projectId',
    authenticate,
    checkPermission('consultant-assignments', 'view'),
    consultantAssignmentController.getProjectAssignments
);

/**
 * @route GET /api/v1/consultant-assignments/client/:clientId
 * @description Get client assignments (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/client/:clientId',
    authenticate,
    checkPermission('consultant-assignments', 'view'),
    consultantAssignmentController.getClientAssignments
);

/**
 * @route GET /api/v1/consultant-assignments/:assignmentId
 * @description Get assignment by ID (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/:assignmentId',
    authenticate,
    checkPermission('consultant-assignments', 'view'),
    consultantAssignmentController.getAssignmentById
);

// ============================================================================
// SELF-SERVICE TIME TRACKING
// ============================================================================

/**
 * @route POST /api/v1/consultant-assignments/:assignmentId/time-log
 * @description Log time for assignment (self-service)
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

/*
 * REMOVED ROUTES - Moved to Admin-Server:
 * 
 * ASSIGNMENT CREATION & MANAGEMENT:
 * - POST /api/v1/consultant-assignments - Create new assignment (administrative)
 * - POST /api/v1/consultant-assignments/bulk - Bulk create assignments (administrative)
 * - PUT /api/v1/consultant-assignments/:assignmentId - Update assignment (administrative)
 * - DELETE /api/v1/consultant-assignments/:assignmentId - Delete assignment (administrative)
 * - POST /api/v1/consultant-assignments/:assignmentId/extend - Extend assignment (administrative)
 * 
 * LIFECYCLE MANAGEMENT:
 * - POST /api/v1/consultant-assignments/:assignmentId/start - Start assignment (administrative)
 * - POST /api/v1/consultant-assignments/:assignmentId/complete - Complete assignment (administrative)
 * - POST /api/v1/consultant-assignments/:assignmentId/cancel - Cancel assignment (administrative)
 * - POST /api/v1/consultant-assignments/:assignmentId/hold - Put assignment on hold (administrative)
 * - POST /api/v1/consultant-assignments/:assignmentId/resume - Resume assignment (administrative)
 * 
 * APPROVAL WORKFLOW:
 * - GET /api/v1/consultant-assignments/pending-approvals - Get pending approvals (administrative)
 * - POST /api/v1/consultant-assignments/:assignmentId/approve - Approve assignment (administrative)
 * - POST /api/v1/consultant-assignments/:assignmentId/reject - Reject assignment (administrative)
 * 
 * REPORTING & ANALYTICS:
 * - GET /api/v1/consultant-assignments/utilization-report - Get utilization report (administrative)
 * - GET /api/v1/consultant-assignments/revenue-report - Get revenue report (administrative)
 * - GET /api/v1/consultant-assignments/statistics - Get assignment statistics (administrative)
 * 
 * Note: Consultants can view their own assignments and those of their colleagues for collaboration purposes.
 * Consultants can log time to their assigned projects.
 * Assignment creation, lifecycle management, and approvals require administrative access through admin-server.
 */