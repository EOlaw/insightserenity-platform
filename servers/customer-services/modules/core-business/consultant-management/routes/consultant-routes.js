/**
 * @fileoverview Consultant Routes
 * @module servers/customer-services/modules/core-business/consultant-management/routes/consultant-routes
 * @description Express routes for consultant management operations including CRUD,
 * profile management, skills, certifications, performance, compliance, and status lifecycle
 */

const express = require('express');
const router = express.Router();

const consultantController = require('../controllers/consultant-controller');
const { ConsultantController } = require('../controllers/consultant-controller');

// Middleware imports - adjust paths based on your project structure
const { authenticate } = require('../../../../../../shared/lib/middleware/auth-middleware');
const { authorize, checkPermission } = require('../../../../../../shared/lib/middleware/permission-middleware');
const { rateLimiter } = require('../../../../../../shared/lib/middleware/rate-limiter');

// ============================================================================
// ROUTE DEFINITIONS
// ============================================================================

/**
 * @route GET /api/v1/consultants
 * @description List all consultants with filtering and pagination
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
 * @description Search consultants by text query
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
 * @description Find available consultants based on criteria
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
 * @description Search consultants by skill requirements
 * @access Private - Requires authentication and view permission
 */
router.post(
    '/search-by-skills',
    authenticate,
    checkPermission('consultants', 'view'),
    consultantController.searchBySkills
);

/**
 * @route GET /api/v1/consultants/statistics
 * @description Get consultant statistics and analytics
 * @access Private - Requires authentication and reports permission
 */
router.get(
    '/statistics',
    authenticate,
    checkPermission('consultants', 'reports'),
    consultantController.getConsultantStatistics
);

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

/**
 * @route POST /api/v1/consultants
 * @description Create a new consultant
 * @access Private - Requires authentication and create permission
 */
router.post(
    '/',
    authenticate,
    checkPermission('consultants', 'create'),
    ConsultantController.createValidation(),
    consultantController.createConsultant
);

/**
 * @route POST /api/v1/consultants/bulk
 * @description Bulk create consultants
 * @access Private - Requires authentication and create permission
 */
router.post(
    '/bulk',
    authenticate,
    checkPermission('consultants', 'create'),
    rateLimiter({ windowMs: 60000, max: 10 }),
    consultantController.bulkCreateConsultants
);

/**
 * @route GET /api/v1/consultants/:consultantId
 * @description Get consultant by ID
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
 * @description Get consultant by user ID
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/user/:userId',
    authenticate,
    checkPermission('consultants', 'view'),
    consultantController.getConsultantByUserId
);

/**
 * @route PUT /api/v1/consultants/:consultantId
 * @description Update consultant
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:consultantId',
    authenticate,
    checkPermission('consultants', 'update'),
    ConsultantController.updateValidation(),
    consultantController.updateConsultant
);

/**
 * @route DELETE /api/v1/consultants/:consultantId
 * @description Delete consultant (soft delete by default)
 * @access Private - Requires authentication and delete permission
 */
router.delete(
    '/:consultantId',
    authenticate,
    checkPermission('consultants', 'delete'),
    consultantController.deleteConsultant
);

// ============================================================================
// DIRECT REPORTS
// ============================================================================

/**
 * @route GET /api/v1/consultants/:consultantId/direct-reports
 * @description Get direct reports for a consultant/manager
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/:consultantId/direct-reports',
    authenticate,
    checkPermission('consultants', 'view'),
    consultantController.getDirectReports
);

// ============================================================================
// AVAILABILITY ROUTES
// ============================================================================

/**
 * @route PUT /api/v1/consultants/:consultantId/availability
 * @description Update consultant availability
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:consultantId/availability',
    authenticate,
    checkPermission('consultants', 'update'),
    ConsultantController.availabilityValidation(),
    consultantController.updateAvailability
);

/**
 * @route POST /api/v1/consultants/:consultantId/blackout-dates
 * @description Add blackout dates for a consultant
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/blackout-dates',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.addBlackoutDates
);

// ============================================================================
// SKILLS ROUTES (Embedded skills on consultant)
// ============================================================================

/**
 * @route POST /api/v1/consultants/:consultantId/skills
 * @description Add skill to consultant (embedded)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/skills',
    authenticate,
    checkPermission('consultants', 'update'),
    ConsultantController.addSkillValidation(),
    consultantController.addSkill
);

/**
 * @route PUT /api/v1/consultants/:consultantId/skills/:skillName
 * @description Update consultant skill (embedded)
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:consultantId/skills/:skillName',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.updateSkill
);

/**
 * @route DELETE /api/v1/consultants/:consultantId/skills/:skillName
 * @description Remove skill from consultant (embedded)
 * @access Private - Requires authentication and update permission
 */
router.delete(
    '/:consultantId/skills/:skillName',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.removeSkill
);

/**
 * @route POST /api/v1/consultants/:consultantId/skills/:skillName/verify
 * @description Verify consultant skill
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:consultantId/skills/:skillName/verify',
    authenticate,
    checkPermission('consultants', 'manage'),
    consultantController.verifySkill
);

// ============================================================================
// CERTIFICATIONS ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultants/:consultantId/certifications
 * @description Add certification to consultant
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/certifications',
    authenticate,
    checkPermission('consultants', 'update'),
    ConsultantController.addCertificationValidation(),
    consultantController.addCertification
);

/**
 * @route PUT /api/v1/consultants/:consultantId/certifications/:certificationId
 * @description Update consultant certification
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:consultantId/certifications/:certificationId',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.updateCertification
);

/**
 * @route DELETE /api/v1/consultants/:consultantId/certifications/:certificationId
 * @description Remove certification from consultant
 * @access Private - Requires authentication and update permission
 */
router.delete(
    '/:consultantId/certifications/:certificationId',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.removeCertification
);

// ============================================================================
// EDUCATION & WORK HISTORY ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultants/:consultantId/education
 * @description Add education to consultant
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/education',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.addEducation
);

/**
 * @route POST /api/v1/consultants/:consultantId/work-history
 * @description Add work history to consultant
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/work-history',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.addWorkHistory
);

// ============================================================================
// DOCUMENTS ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultants/:consultantId/documents
 * @description Add document to consultant
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/documents',
    authenticate,
    checkPermission('consultants', 'update'),
    ConsultantController.addDocumentValidation(),
    consultantController.addDocument
);

/**
 * @route DELETE /api/v1/consultants/:consultantId/documents/:documentId
 * @description Remove document from consultant
 * @access Private - Requires authentication and update permission
 */
router.delete(
    '/:consultantId/documents/:documentId',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.removeDocument
);

// ============================================================================
// PERFORMANCE ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultants/:consultantId/reviews
 * @description Add performance review
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:consultantId/reviews',
    authenticate,
    checkPermission('consultants', 'manage'),
    ConsultantController.addReviewValidation(),
    consultantController.addPerformanceReview
);

/**
 * @route POST /api/v1/consultants/:consultantId/feedback
 * @description Add feedback for consultant
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/feedback',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.addFeedback
);

/**
 * @route POST /api/v1/consultants/:consultantId/achievements
 * @description Add achievement for consultant
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/achievements',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.addAchievement
);

// ============================================================================
// COMPLIANCE ROUTES
// ============================================================================

/**
 * @route PUT /api/v1/consultants/:consultantId/compliance
 * @description Update compliance status
 * @access Private - Requires authentication and manage permission
 */
router.put(
    '/:consultantId/compliance',
    authenticate,
    checkPermission('consultants', 'manage'),
    consultantController.updateComplianceStatus
);

/**
 * @route POST /api/v1/consultants/:consultantId/conflict-of-interest
 * @description Add conflict of interest declaration
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:consultantId/conflict-of-interest',
    authenticate,
    checkPermission('consultants', 'update'),
    consultantController.addConflictOfInterestDeclaration
);

// ============================================================================
// STATUS LIFECYCLE ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultants/:consultantId/activate
 * @description Activate consultant
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:consultantId/activate',
    authenticate,
    checkPermission('consultants', 'manage'),
    consultantController.activateConsultant
);

/**
 * @route POST /api/v1/consultants/:consultantId/deactivate
 * @description Deactivate consultant
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:consultantId/deactivate',
    authenticate,
    checkPermission('consultants', 'manage'),
    consultantController.deactivateConsultant
);

/**
 * @route POST /api/v1/consultants/:consultantId/leave
 * @description Put consultant on leave
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:consultantId/leave',
    authenticate,
    checkPermission('consultants', 'manage'),
    consultantController.putOnLeave
);

/**
 * @route POST /api/v1/consultants/:consultantId/suspend
 * @description Suspend consultant
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:consultantId/suspend',
    authenticate,
    checkPermission('consultants', 'manage'),
    consultantController.suspendConsultant
);

/**
 * @route POST /api/v1/consultants/:consultantId/terminate
 * @description Terminate consultant
 * @access Private - Requires authentication and manage permission
 */
router.post(
    '/:consultantId/terminate',
    authenticate,
    checkPermission('consultants', 'manage'),
    consultantController.terminateConsultant
);

// ============================================================================
// REPORTS ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultants/:consultantId/utilization
 * @description Get utilization report for a consultant
 * @access Private - Requires authentication and reports permission
 */
router.get(
    '/:consultantId/utilization',
    authenticate,
    checkPermission('consultants', 'reports'),
    consultantController.getUtilizationReport
);

module.exports = router;