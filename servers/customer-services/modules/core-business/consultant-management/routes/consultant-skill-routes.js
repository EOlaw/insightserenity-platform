/**
 * @fileoverview Consultant Skill Routes
 * @module servers/customer-services/modules/core-business/consultant-management/routes/consultant-skill-routes
 * @description Express routes for consultant skill management operations including
 * skill records, proficiency assessments, endorsements, project experience, and training
 */

const express = require('express');
const router = express.Router();

const consultantSkillController = require('../controllers/consultant-skill-controller');
const { ConsultantSkillController } = require('../controllers/consultant-skill-controller');

// Middleware imports - adjust paths based on your project structure
const { authenticate } = require('../../../../../../shared/lib/middleware/auth-middleware');
const { authorize, checkPermission } = require('../../../../../../shared/lib/middleware/permission-middleware');
const { rateLimiter } = require('../../../../../../shared/lib/middleware/rate-limiter');

// ============================================================================
// ORGANIZATION-WIDE SKILL ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-skills/search
 * @description Search skills across all consultants
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/search',
    authenticate,
    checkPermission('consultant-skills', 'view'),
    consultantSkillController.searchSkills
);

/**
 * @route POST /api/v1/consultant-skills/find-consultants
 * @description Find consultants with specific skills
 * @access Private - Requires authentication and view permission
 */
router.post(
    '/find-consultants',
    authenticate,
    checkPermission('consultant-skills', 'view'),
    consultantSkillController.findConsultantsWithSkills
);

/**
 * @route GET /api/v1/consultant-skills/distribution
 * @description Get skill distribution analytics
 * @access Private - Requires authentication and reports permission
 */
router.get(
    '/distribution',
    authenticate,
    checkPermission('consultant-skills', 'reports'),
    consultantSkillController.getSkillDistribution
);

/**
 * @route GET /api/v1/consultant-skills/matrix
 * @description Get organization skill matrix
 * @access Private - Requires authentication and reports permission
 */
router.get(
    '/matrix',
    authenticate,
    checkPermission('consultant-skills', 'reports'),
    consultantSkillController.getOrganizationSkillMatrix
);

/**
 * @route GET /api/v1/consultant-skills/statistics
 * @description Get skill statistics
 * @access Private - Requires authentication and reports permission
 */
router.get(
    '/statistics',
    authenticate,
    checkPermission('consultant-skills', 'reports'),
    consultantSkillController.getSkillStatistics
);

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
// CONSULTANT-SPECIFIC SKILL ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-skills/consultant/:consultantId
 * @description Get all skills for a consultant
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
 * @route POST /api/v1/consultant-skills/consultant/:consultantId
 * @description Create a new skill record for a consultant
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
 * @route POST /api/v1/consultant-skills/consultant/:consultantId/bulk
 * @description Bulk create skill records for a consultant
 * @access Private - Requires authentication and create permission
 */
router.post(
    '/consultant/:consultantId/bulk',
    authenticate,
    checkPermission('consultant-skills', 'create'),
    rateLimiter({ windowMs: 60000, max: 10 }),
    consultantSkillController.bulkCreateSkillRecords
);

/**
 * @route POST /api/v1/consultant-skills/consultant/:consultantId/gap-analysis
 * @description Get skill gap analysis for a consultant
 * @access Private - Requires authentication and reports permission
 */
router.post(
    '/consultant/:consultantId/gap-analysis',
    authenticate,
    checkPermission('consultant-skills', 'reports'),
    consultantSkillController.getSkillGapAnalysis
);

// ============================================================================
// INDIVIDUAL SKILL RECORD ROUTES
// ============================================================================

/**
 * @route GET /api/v1/consultant-skills/:skillRecordId
 * @description Get skill record by ID
 * @access Private - Requires authentication and view permission
 */
router.get(
    '/:skillRecordId',
    authenticate,
    checkPermission('consultant-skills', 'view'),
    consultantSkillController.getSkillRecordById
);

/**
 * @route PUT /api/v1/consultant-skills/:skillRecordId
 * @description Update skill record
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
 * @description Delete skill record (soft delete by default)
 * @access Private - Requires authentication and delete permission
 */
router.delete(
    '/:skillRecordId',
    authenticate,
    checkPermission('consultant-skills', 'delete'),
    consultantSkillController.deleteSkillRecord
);

// ============================================================================
// PROFICIENCY ASSESSMENT ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/assessments
 * @description Submit proficiency assessment
 * @access Private - Requires authentication and assess permission
 */
router.post(
    '/:skillRecordId/assessments',
    authenticate,
    checkPermission('consultant-skills', 'assess'),
    ConsultantSkillController.assessmentValidation(),
    consultantSkillController.submitProficiencyAssessment
);

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
 * @description Request skill assessment from manager or peer
 * @access Private - Requires authentication only
 */
router.post(
    '/:skillRecordId/request-assessment',
    authenticate,
    consultantSkillController.requestAssessment
);

// ============================================================================
// ENDORSEMENT ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/endorsements
 * @description Add endorsement to skill
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
 * @description Remove endorsement from skill
 * @access Private - Requires authentication and endorse permission
 */
router.delete(
    '/:skillRecordId/endorsements/:endorsementId',
    authenticate,
    checkPermission('consultant-skills', 'endorse'),
    consultantSkillController.removeEndorsement
);

// ============================================================================
// PROJECT EXPERIENCE ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/projects
 * @description Add project experience to skill
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
 * @description Update project experience feedback
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:skillRecordId/projects/:projectId/feedback',
    authenticate,
    checkPermission('consultant-skills', 'update'),
    consultantSkillController.updateProjectFeedback
);

// ============================================================================
// TRAINING ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/courses/completed
 * @description Add completed course to skill
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
 * @description Add course enrollment to skill
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
 * @description Update course enrollment progress
 * @access Private - Requires authentication and update permission
 */
router.put(
    '/:skillRecordId/courses/:courseId/progress',
    authenticate,
    checkPermission('consultant-skills', 'update'),
    consultantSkillController.updateEnrollmentProgress
);

// ============================================================================
// VERIFICATION ROUTES
// ============================================================================

/**
 * @route POST /api/v1/consultant-skills/:skillRecordId/verify
 * @description Verify skill through certification
 * @access Private - Requires authentication and verify permission
 */
router.post(
    '/:skillRecordId/verify',
    authenticate,
    checkPermission('consultant-skills', 'verify'),
    consultantSkillController.verifyCertification
);

module.exports = router;