/**
 * @fileoverview Consultant Skill Routes - Customer Services
 * @module servers/customer-services/modules/core-business/consultant-management/routes/consultant-skill-routes
 * @description Express routes for consultant skill self-service and peer collaboration operations.
 * Administrative operations (organization-wide analytics, bulk operations, formal assessments, verification)
 * have been moved to admin-server.
 */

const express = require('express');
const router = express.Router();

const consultantSkillController = require('../controllers/consultant-skill-controller');
const { ConsultantSkillController } = require('../controllers/consultant-skill-controller');

// Middleware imports
const { authenticate } = require('../../../../../../shared/lib/middleware/auth-middleware');
const { checkPermission } = require('../../../../../../shared/lib/middleware/permission-middleware');

// ============================================================================
// SELF-SERVICE SKILL ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-skills/me
 * @description Get current user's skills (self-service)
 * @access Private - Requires authentication only
 */
router.get(
    '/me',
    authenticate,
    consultantSkillController.getMySkills
);

// ============================================================================
// PEER VIEWING ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-skills/consultant/:consultantId
 * @description Get all skills for a consultant (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/consultant/:consultantId',
    authenticate,
    checkPermission('consultant-skills', 'view'),
    ConsultantSkillController.listValidation(),
    consultantSkillController.getConsultantSkills
);

/**
 * @route GET /api/v1/consultant-skills/:skillRecordId
 * @description Get skill record by ID (peer view)
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/:skillRecordId',
    authenticate,
    checkPermission('consultant-skills', 'view'),
    consultantSkillController.getSkillRecordById
);

// ============================================================================
// SELF-SERVICE SKILL RECORD MANAGEMENT
// ============================================================================

/**
 * @route POST /api/v1/consultant-skills/consultant/:consultantId
 * @description Create a new skill record for a consultant (self-service)
 * @access Private - Requires authentication and create permission
 */
router.post(
    '/consultant/:consultantId',
    authenticate,
    checkPermission('consultant-skills', 'create'),
    ConsultantSkillController.createValidation(),
    consultantSkillController.createSkillRecord
);

/**
 * @route PUT /api/v1/consultant-skills/:skillRecordId
 * @description Update skill record (self-service)
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:skillRecordId',
    authenticate,
    checkPermission('consultant-skills', 'update'),
    ConsultantSkillController.updateValidation(),
    consultantSkillController.updateSkillRecord
);

/**
 * @route DELETE /api/v1/consultant-skills/:skillRecordId
 * @description Delete skill record (self-service, soft delete by default)
 * @access Private - Requires authentication and delete permission
 */
router.delete(
    '/:skillRecordId',
    authenticate,
    checkPermission('consultant-skills', 'delete'),
    consultantSkillController.deleteSkillRecord
);

// ============================================================================
// SELF-ASSESSMENT ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/self-assessment
 * @description Submit self-assessment (self-service)
 * @access Private - Requires authentication only
 */
router.post(
    '/:skillRecordId/self-assessment',
    authenticate,
    consultantSkillController.submitSelfAssessment
);

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/request-assessment
 * @description Request skill assessment from manager or peer (self-service)
 * @access Private - Requires authentication only
 */
router.post(
    '/:skillRecordId/request-assessment',
    authenticate,
    consultantSkillController.requestAssessment
);

// ============================================================================
// PEER COLLABORATION - ENDORSEMENTS
// ============================================================================

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/endorsements
 * @description Add endorsement to skill (peer collaboration)
 * @access Private - Requires authentication and endorse permission
 */
router.post(
    '/:skillRecordId/endorsements',
    authenticate,
    checkPermission('consultant-skills', 'endorse'),
    ConsultantSkillController.endorsementValidation(),
    consultantSkillController.addEndorsement
);

/**
 * @route DELETE /api/v1/consultant-skills/:skillRecordId/endorsements/:endorsementId
 * @description Remove endorsement from skill (peer collaboration)
 * @access Private - Requires authentication and endorse permission
 */
router.delete(
    '/:skillRecordId/endorsements/:endorsementId',
    authenticate,
    checkPermission('consultant-skills', 'endorse'),
    consultantSkillController.removeEndorsement
);

// ============================================================================
// SELF-SERVICE PROJECT EXPERIENCE
// ============================================================================

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/projects
 * @description Add project experience to skill (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:skillRecordId/projects',
    authenticate,
    checkPermission('consultant-skills', 'update'),
    ConsultantSkillController.projectExperienceValidation(),
    consultantSkillController.addProjectExperience
);

/**
 * @route PUT /api/v1/consultant-skills/:skillRecordId/projects/:projectId/feedback
 * @description Update project experience feedback (self-service)
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:skillRecordId/projects/:projectId/feedback',
    authenticate,
    checkPermission('consultant-skills', 'update'),
    consultantSkillController.updateProjectFeedback
);

// ============================================================================
// SELF-SERVICE TRAINING & COURSES
// ============================================================================

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/courses/completed
 * @description Add completed course to skill (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:skillRecordId/courses/completed',
    authenticate,
    checkPermission('consultant-skills', 'update'),
    ConsultantSkillController.courseValidation(),
    consultantSkillController.addCompletedCourse
);

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/courses/enrollment
 * @description Add course enrollment to skill (self-service)
 * @access Private - Requires authentication and update permission
 */
router.post(
    '/:skillRecordId/courses/enrollment',
    authenticate,
    checkPermission('consultant-skills', 'update'),
    consultantSkillController.addCourseEnrollment
);

/**
 * @route PUT /api/v1/consultant-skills/:skillRecordId/courses/:courseId/progress
 * @description Update course enrollment progress (self-service)
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:skillRecordId/courses/:courseId/progress',
    authenticate,
    checkPermission('consultant-skills', 'update'),
    consultantSkillController.updateEnrollmentProgress
);

module.exports = router;

/*
 * REMOVED ROUTES - Moved to Admin-Server:
 * 
 * ORGANIZATION-WIDE SKILL SEARCH & ANALYTICS:
 * - GET /api/v1/consultant-skills/search - Search skills across all consultants (administrative)
 * - POST /api/v1/consultant-skills/find-consultants - Find consultants with specific skills (administrative)
 * - GET /api/v1/consultant-skills/distribution - Skill distribution analytics (administrative)
 * - GET /api/v1/consultant-skills/matrix - Organization skill matrix (administrative)
 * - GET /api/v1/consultant-skills/statistics - Skill statistics (administrative)
 * 
 * BULK OPERATIONS:
 * - POST /api/v1/consultant-skills/consultant/:consultantId/bulk - Bulk create skill records (administrative)
 * 
 * ADMINISTRATIVE ASSESSMENTS:
 * - POST /api/v1/consultant-skills/:skillRecordId/assessments - Submit proficiency assessment (administrative)
 * - POST /api/v1/consultant-skills/consultant/:consultantId/gap-analysis - Skill gap analysis (administrative)
 * 
 * SKILL VERIFICATION:
 * - POST /api/v1/consultant-skills/:skillRecordId/verify - Verify skill through certification (administrative)
 * 
 * Note: Consultants can manage their own skill records, request assessments, and endorse peers.
 * Formal assessments, skill verification, and organization-wide analytics require administrative access.
 */