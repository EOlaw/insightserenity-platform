/**
 * @fileoverview Consultant Routes - Customer Services
 * @module servers/customer-services/modules/core-business/consultant-management/routes/consultant-routes
 * @description Express routes for consultant self-service and peer viewing operations.
 * Administrative operations (lifecycle management, bulk operations, statistics) have been moved to admin-server.
 * Skill operations have been moved to consultant-skill-routes for better organization.
 */

const express = require('express');
const router = express.Router();

const consultantController = require('../controllers/consultant-controller');
const { ConsultantController } = require('../controllers/consultant-controller');

// Middleware imports
const { authenticate } = require('../../../../../../shared/lib/middleware/auth-middleware');
const { checkPermission } = require('../../../../../../shared/lib/middleware/permission-middleware');

// ============================================================================
// SELF-SERVICE ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultants/me
 * @description Get current user's consultant profile (self-service)
 * @access Private - Requires authentication only
 */
router.get(
    '/me',
    authenticate,
    consultantController.getMyProfile
);

/**
 * @route PUT /api/v1/consultants/me
 * @description Update current user's consultant profile (self-service)
 * @access Private - Requires authentication only
 */
router.put(
    '/me',
    authenticate,
    consultantController.updateMyProfile
);

// ============================================================================
// PEER VIEWING ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultants
 * @description List all consultants with filtering and pagination (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/',
    authenticate,
    checkPermission('consultants', 'view'),
    ConsultantController.listValidation(),
    consultantController.listConsultants
);

/**
 * @route GET /api/v1/consultants/search
 * @description Search consultants by text query (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/search',
    authenticate,
    checkPermission('consultants', 'view'),
    consultantController.searchConsultants
);

/**
 * @route GET /api/v1/consultants/available
 * @description Find available consultants based on criteria (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/available',
    authenticate,
    checkPermission('consultants', 'view'),
    consultantController.findAvailableConsultants
);

/**
 * @route POST /api/v1/consultants/search-by-skills
 * @description Search consultants by skill requirements (peer view)
 * @access Private - Requires authentication and view permission
 */
router.post(
    '/search-by-skills',
    authenticate,
    checkPermission('consultants', 'view'),
    consultantController.searchBySkills
);

/**
 * @route GET /api/v1/consultants/:consultantId
 * @description Get consultant by ID (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/:consultantId',
    authenticate,
    checkPermission('consultants', 'view'),
    consultantController.getConsultantById
);

/**
 * @route GET /api/v1/consultants/user/:userId
 * @description Get consultant by user ID (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/user/:userId',
    authenticate,
    checkPermission('consultants', 'view'),
    consultantController.getConsultantByUserId
);

/**
 * @route GET /api/v1/consultants/:consultantId/direct-reports
 * @description Get direct reports for a consultant/manager (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/:consultantId/direct-reports',
    authenticate,
    checkPermission('consultants', 'view'),
    consultantController.getDirectReports
);

// ============================================================================
// SELF-SERVICE AVAILABILITY MANAGEMENT
// ============================================================================

/**
 * @route PUT /api/v1/consultants/:consultantId/availability
 * @description Update consultant availability preferences (self-service)
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:consultantId/availability',
    authenticate,
    // checkPermission('consultants', 'update'),
    ConsultantController.availabilityValidation(),
    consultantController.updateAvailability
);

/**
 * @route POST /api/v1/consultants/:consultantId/blackout-dates
 * @description Add blackout dates for a consultant (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/blackout-dates',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.addBlackoutDates
);

// ============================================================================
// SELF-SERVICE CERTIFICATIONS MANAGEMENT
// ============================================================================

/**
 * @route POST /api/v1/consultants/:consultantId/certifications
 * @description Add certification to consultant (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/certifications',
    authenticate,
    // checkPermission('consultants', 'update'),
    ConsultantController.addCertificationValidation(),
    consultantController.addCertification
);

/**
 * @route PUT /api/v1/consultants/:consultantId/certifications/:certificationId
 * @description Update consultant certification (self-service)
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:consultantId/certifications/:certificationId',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.updateCertification
);

/**
 * @route DELETE /api/v1/consultants/:consultantId/certifications/:certificationId
 * @description Remove certification from consultant (self-service)
 * @access Private - Requires authentication and update permission
 */
router.delete(
    '/:consultantId/certifications/:certificationId',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.removeCertification
);

// ============================================================================
// SELF-SERVICE EDUCATION & WORK HISTORY
// ============================================================================

/**
 * @route POST /api/v1/consultants/:consultantId/education
 * @description Add education to consultant (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/education',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.addEducation
);

/**
 * @route POST /api/v1/consultants/:consultantId/work-history
 * @description Add work history to consultant (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/work-history',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.addWorkHistory
);

// ============================================================================
// SELF-SERVICE DOCUMENT MANAGEMENT
// ============================================================================

/**
 * @route POST /api/v1/consultants/:consultantId/documents
 * @description Add document to consultant (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/documents',
    authenticate,
    // checkPermission('consultants', 'update'),
    ConsultantController.addDocumentValidation(),
    consultantController.addDocument
);

/**
 * @route DELETE /api/v1/consultants/:consultantId/documents/:documentId
 * @description Remove document from consultant (self-service)
 * @access Private - Requires authentication and update permission
 */
router.delete(
    '/:consultantId/documents/:documentId',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.removeDocument
);

/**
 * @route POST /api/v1/consultants/:consultantId/documents/:documentId/restore
 * @description Restore archived document (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/documents/:documentId/restore',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.restoreDocument
);

// ============================================================================
// PEER COLLABORATION
// ============================================================================

/**
 * @route POST /api/v1/consultants/:consultantId/feedback
 * @description Add feedback for consultant (peer collaboration)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/feedback',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.addFeedback
);

/**
 * @route PUT /api/v1/consultants/:consultantId/feedback/:feedbackId
 * @description Update feedback for consultant (peer collaboration)
 * @access Private - Requires authentication and must be feedback author
 */
router.put(
    '/:consultantId/feedback/:feedbackId',
    authenticate,
    consultantController.updateFeedback
);

/**
 * @route DELETE /api/v1/consultants/:consultantId/feedback/:feedbackId
 * @description Remove feedback from consultant (peer collaboration)
 * @access Private - Requires authentication and must be feedback author
 */
router.delete(
    '/:consultantId/feedback/:feedbackId',
    authenticate,
    consultantController.removeFeedback
);

/**
 * @route POST /api/v1/consultants/:consultantId/feedback/:feedbackId/restore
 * @description Restore archived feedback (peer collaboration)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/feedback/:feedbackId/restore',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.restoreFeedback
);

/**
 * @route POST /api/v1/consultants/:consultantId/achievements
 * @description Add achievement for consultant (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/achievements',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.addAchievement
);

/**
 * @route POST /api/v1/consultants/:consultantId/conflict-of-interest
 * @description Add conflict of interest declaration (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/conflict-of-interest',
    authenticate,
    // checkPermission('consultants', 'update'),
    consultantController.addConflictOfInterestDeclaration
);

module.exports = router;

/*
 * REMOVED ROUTES - Moved to Admin-Server:
 * 
 * ADMINISTRATIVE CONSULTANT MANAGEMENT:
 * - POST /api/v1/consultants - Create consultant (administrative)
 * - POST /api/v1/consultants/bulk - Bulk create consultants (administrative)
 * - PUT /api/v1/consultants/:consultantId - Update consultant (administrative)
 * - DELETE /api/v1/consultants/:consultantId - Delete consultant (administrative)
 * - GET /api/v1/consultants/statistics - Organization statistics (administrative)
 * 
 * LIFECYCLE MANAGEMENT:
 * - POST /api/v1/consultants/:consultantId/activate - Activate consultant (administrative)
 * - POST /api/v1/consultants/:consultantId/deactivate - Deactivate consultant (administrative)
 * - POST /api/v1/consultants/:consultantId/leave - Put on leave (administrative)
 * - POST /api/v1/consultants/:consultantId/suspend - Suspend consultant (administrative)
 * - POST /api/v1/consultants/:consultantId/terminate - Terminate consultant (administrative)
 * 
 * ADMINISTRATIVE PERFORMANCE & COMPLIANCE:
 * - POST /api/v1/consultants/:consultantId/reviews - Add performance review (administrative)
 * - PUT /api/v1/consultants/:consultantId/compliance - Update compliance status (administrative)
 * - GET /api/v1/consultants/:consultantId/utilization - Utilization report (administrative)
 * 
 * REMOVED ROUTES - Moved to consultant-skill-routes.js:
 * 
 * SKILL MANAGEMENT (now in consultant-skill-routes for better organization):
 * - POST /api/v1/consultants/:consultantId/skills - Add skill (moved to skill routes)
 * - PUT /api/v1/consultants/:consultantId/skills/:skillName - Update skill (moved to skill routes)
 * - DELETE /api/v1/consultants/:consultantId/skills/:skillName - Remove skill (moved to skill routes)
 * - POST /api/v1/consultants/:consultantId/skills/:skillName/verify - Verify skill (moved to skill routes + administrative)
 * 
 * Note: Consultants cannot create, update, or delete consultant records except their own profile via /me endpoints.
 * When consultants register, the system automatically creates their consultant document.
 */