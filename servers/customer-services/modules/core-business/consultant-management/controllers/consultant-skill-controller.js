/**
 * @fileoverview Consultant Skill Controller
 * @module servers/customer-services/modules/core-business/consultant-management/controllers/consultant-skill-controller
 * @description HTTP request handlers for consultant skill management operations including
 * skill records, proficiency assessments, endorsements, project experience, and training
 */

const { validationResult, body, param, query } = require('express-validator');
const consultantSkillService = require('../services/consultant-skill-service');
const {
    SKILL_CATEGORIES,
    PROFICIENCY_LEVELS,
    VERIFICATION_STATUS,
    ASSESSMENT_TYPES,
    SKILL_APPLICATION,
    PROJECT_COMPLEXITY,
    SKILL_STATUS
} = require('../services/consultant-skill-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-skill-controller'
});

/**
 * Consultant Skill Controller
 * Handles HTTP requests for consultant skill management operations
 * @class ConsultantSkillController
 */
class ConsultantSkillController {
    constructor() {
        // Bind methods to preserve 'this' context
        this.createSkillRecord = this.createSkillRecord.bind(this);
        this.bulkCreateSkillRecords = this.bulkCreateSkillRecords.bind(this);
        this.getSkillRecordById = this.getSkillRecordById.bind(this);
        this.getConsultantSkills = this.getConsultantSkills.bind(this);
        this.getMySkills = this.getMySkills.bind(this);
        this.searchSkills = this.searchSkills.bind(this);
        this.findConsultantsWithSkills = this.findConsultantsWithSkills.bind(this);
        this.updateSkillRecord = this.updateSkillRecord.bind(this);
        this.submitProficiencyAssessment = this.submitProficiencyAssessment.bind(this);
        this.submitSelfAssessment = this.submitSelfAssessment.bind(this);
        this.requestAssessment = this.requestAssessment.bind(this);
        this.addEndorsement = this.addEndorsement.bind(this);
        this.removeEndorsement = this.removeEndorsement.bind(this);
        this.addProjectExperience = this.addProjectExperience.bind(this);
        this.updateProjectFeedback = this.updateProjectFeedback.bind(this);
        this.addCompletedCourse = this.addCompletedCourse.bind(this);
        this.addCourseEnrollment = this.addCourseEnrollment.bind(this);
        this.updateEnrollmentProgress = this.updateEnrollmentProgress.bind(this);
        this.verifyCertification = this.verifyCertification.bind(this);
        this.deleteSkillRecord = this.deleteSkillRecord.bind(this);
        this.getSkillDistribution = this.getSkillDistribution.bind(this);
        this.getSkillGapAnalysis = this.getSkillGapAnalysis.bind(this);
        this.getOrganizationSkillMatrix = this.getOrganizationSkillMatrix.bind(this);
        this.getSkillStatistics = this.getSkillStatistics.bind(this);
    }

    // ============================================================================
    // VALIDATION RULES
    // ============================================================================

    /**
     * Validation rules for creating a skill record
     * @static
     * @returns {Array} Express validator chain
     */
    static createValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            body('name')
                .trim()
                .notEmpty().withMessage('Skill name is required')
                .isLength({ max: 100 }).withMessage('Skill name must be at most 100 characters'),
            body('category')
                .notEmpty().withMessage('Skill category is required')
                .isIn(Object.values(SKILL_CATEGORIES)).withMessage('Invalid skill category'),
            body('subcategory')
                .optional()
                .trim()
                .isLength({ max: 100 }).withMessage('Subcategory must be at most 100 characters'),
            body('description')
                .optional()
                .isLength({ max: 1000 }).withMessage('Description must be at most 1000 characters'),
            body('proficiency.level')
                .optional()
                .isIn(Object.values(PROFICIENCY_LEVELS)).withMessage('Invalid proficiency level'),
            body('experience.yearsOfExperience')
                .optional()
                .isFloat({ min: 0, max: 50 }).withMessage('Years of experience must be between 0 and 50')
        ];
    }

    /**
     * Validation rules for updating a skill record
     * @static
     * @returns {Array} Express validator chain
     */
    static updateValidation() {
        return [
            param('skillRecordId')
                .notEmpty().withMessage('Skill record ID is required'),
            body('skill.description')
                .optional()
                .isLength({ max: 1000 }).withMessage('Description must be at most 1000 characters'),
            body('experience.yearsOfExperience')
                .optional()
                .isFloat({ min: 0, max: 50 }).withMessage('Years of experience must be between 0 and 50'),
            body('goals.targetLevel')
                .optional()
                .isIn(Object.values(PROFICIENCY_LEVELS)).withMessage('Invalid target proficiency level')
        ];
    }

    /**
     * Validation rules for proficiency assessment
     * @static
     * @returns {Array} Express validator chain
     */
    static assessmentValidation() {
        return [
            param('skillRecordId')
                .notEmpty().withMessage('Skill record ID is required'),
            body('type')
                .notEmpty().withMessage('Assessment type is required')
                .isIn(Object.values(ASSESSMENT_TYPES)).withMessage('Invalid assessment type'),
            body('level')
                .notEmpty().withMessage('Proficiency level is required')
                .isIn(Object.values(PROFICIENCY_LEVELS)).withMessage('Invalid proficiency level'),
            body('score')
                .optional()
                .isInt({ min: 0, max: 100 }).withMessage('Score must be between 0 and 100'),
            body('notes')
                .optional()
                .isLength({ max: 1000 }).withMessage('Notes must be at most 1000 characters')
        ];
    }

    /**
     * Validation rules for adding endorsement
     * @static
     * @returns {Array} Express validator chain
     */
    static endorsementValidation() {
        return [
            param('skillRecordId')
                .notEmpty().withMessage('Skill record ID is required'),
            body('relationship')
                .optional()
                .isIn(['colleague', 'manager', 'client', 'mentor', 'other'])
                .withMessage('Invalid relationship type'),
            body('rating')
                .optional()
                .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
            body('comment')
                .optional()
                .isLength({ max: 500 }).withMessage('Comment must be at most 500 characters')
        ];
    }

    /**
     * Validation rules for adding project experience
     * @static
     * @returns {Array} Express validator chain
     */
    static projectExperienceValidation() {
        return [
            param('skillRecordId')
                .notEmpty().withMessage('Skill record ID is required'),
            body('projectName')
                .trim()
                .notEmpty().withMessage('Project name is required')
                .isLength({ max: 200 }).withMessage('Project name must be at most 200 characters'),
            body('startDate')
                .notEmpty().withMessage('Start date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('endDate')
                .optional()
                .isISO8601().withMessage('Invalid date format'),
            body('skillApplication')
                .optional()
                .isIn(Object.values(SKILL_APPLICATION)).withMessage('Invalid skill application type'),
            body('complexity')
                .optional()
                .isIn(Object.values(PROJECT_COMPLEXITY)).withMessage('Invalid complexity level'),
            body('hoursLogged')
                .optional()
                .isInt({ min: 0 }).withMessage('Hours must be a positive number')
        ];
    }

    /**
     * Validation rules for listing consultant skills
     * @static
     * @returns {Array} Express validator chain
     */
    static listValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            query('category')
                .optional()
                .isIn(Object.values(SKILL_CATEGORIES)).withMessage('Invalid skill category'),
            query('level')
                .optional()
                .isIn(Object.values(PROFICIENCY_LEVELS)).withMessage('Invalid proficiency level'),
            query('limit')
                .optional()
                .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
            query('skip')
                .optional()
                .isInt({ min: 0 }).withMessage('Skip must be a non-negative integer'),
            query('sortBy')
                .optional()
                .isString().withMessage('Sort by must be a string'),
            query('sortOrder')
                .optional()
                .isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
        ];
    }

    /**
     * Validation rules for adding a course
     * @static
     * @returns {Array} Express validator chain
     */
    static courseValidation() {
        return [
            param('skillRecordId')
                .notEmpty().withMessage('Skill record ID is required'),
            body('courseName')
                .trim()
                .notEmpty().withMessage('Course name is required')
                .isLength({ max: 200 }).withMessage('Course name must be at most 200 characters'),
            body('provider')
                .trim()
                .notEmpty().withMessage('Provider is required')
                .isLength({ max: 100 }).withMessage('Provider must be at most 100 characters'),
            body('completedAt')
                .optional()
                .isISO8601().withMessage('Invalid date format'),
            body('score')
                .optional()
                .isFloat({ min: 0, max: 100 }).withMessage('Score must be between 0 and 100')
        ];
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /**
     * Extract tenant ID from request
     * @private
     * @param {Object} req - Express request object
     * @returns {string} Tenant ID
     */
    _getTenantId(req) {
        return req.tenantId || req.user?.tenantId || req.headers['x-tenant-id'];
    }

    /**
     * Extract user ID from request
     * @private
     * @param {Object} req - Express request object
     * @returns {string} User ID
     */
    _getUserId(req) {
        return req.user?.id || req.user?._id || req.userId;
    }

    /**
     * Validate request and throw error if invalid
     * @private
     * @param {Object} req - Express request object
     * @throws {AppError} If validation fails
     */
    _validateRequest(req) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw AppError.validation('Validation failed', {
                errors: errors.array().map(e => e.msg)
            });
        }
    }

    /**
     * Format success response
     * @private
     * @param {Object} res - Express response object
     * @param {Object} data - Response data
     * @param {string} message - Success message
     * @param {number} statusCode - HTTP status code
     */
    _sendSuccess(res, data, message = 'Success', statusCode = 200) {
        res.status(statusCode).json({
            success: true,
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Format error response
     * @private
     * @param {Object} res - Express response object
     * @param {Error} error - Error object
     */
    _sendError(res, error) {
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Internal server error';

        logger.error('Controller error', {
            error: message,
            statusCode,
            stack: error.stack
        });

        res.status(statusCode).json({
            success: false,
            error: {
                message,
                code: error.code,
                details: error.details
            },
            timestamp: new Date().toISOString()
        });
    }

    // ============================================================================
    // CREATE OPERATIONS
    // ============================================================================

    /**
     * Create a new skill record for a consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Skill data
     * @param {Object} res - Express response object
     */
    async createSkillRecord(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const skillRecord = await consultantSkillService.createSkillRecord(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                organizationId: req.body.organizationId,
                userId: this._getUserId(req),
                source: req.body.source || 'manual'
            });

            logger.info('Skill record created via API', {
                skillRecordId: skillRecord.skillRecordId,
                consultantId
            });

            this._sendSuccess(res, skillRecord, 'Skill record created successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Bulk create skill records for a consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Array} req.body.skills - Array of skill data
     * @param {Object} res - Express response object
     */
    async bulkCreateSkillRecords(req, res) {
        try {
            const { consultantId } = req.params;
            const { skills } = req.body;

            if (!Array.isArray(skills) || skills.length === 0) {
                throw AppError.validation('Skills array is required');
            }

            const results = await consultantSkillService.bulkCreateSkillRecords(consultantId, skills, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                source: req.body.source || 'import'
            });

            logger.info('Bulk skill creation completed', {
                consultantId,
                created: results.created.length,
                failed: results.failed.length
            });

            this._sendSuccess(res, results, 'Bulk creation completed', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // READ OPERATIONS
    // ============================================================================

    /**
     * Get skill record by ID
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} res - Express response object
     */
    async getSkillRecordById(req, res) {
        try {
            const { skillRecordId } = req.params;

            const skillRecord = await consultantSkillService.getSkillRecordById(skillRecordId, {
                tenantId: this._getTenantId(req),
                includeConsultant: req.query.includeConsultant === 'true'
            });

            this._sendSuccess(res, skillRecord, 'Skill record retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get all skills for a consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async getConsultantSkills(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const result = await consultantSkillService.getConsultantSkills(consultantId, {
                tenantId: this._getTenantId(req),
                category: req.query.category,
                level: req.query.level,
                verified: req.query.verified === 'true',
                activeOnly: req.query.activeOnly !== 'false',
                primaryOnly: req.query.primaryOnly === 'true',
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            });

            this._sendSuccess(res, result, 'Skills retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get current user's skills (self-service)
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getMySkills(req, res) {
        try {
            // Get consultant by user ID first
            const consultantService = require('../services/consultant-service');
            const consultant = await consultantService.getConsultantByUserId(this._getUserId(req), {
                tenantId: this._getTenantId(req),
                skipTenantCheck: true
            });

            const result = await consultantSkillService.getConsultantSkills(consultant._id, {
                tenantId: this._getTenantId(req),
                skipTenantCheck: true,
                category: req.query.category,
                level: req.query.level,
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0
            });

            this._sendSuccess(res, result, 'Skills retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Search skills across all consultants
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.query.q - Search query
     * @param {Object} res - Express response object
     */
    async searchSkills(req, res) {
        try {
            const { q } = req.query;

            if (!q || q.trim().length < 2) {
                throw AppError.validation('Search query must be at least 2 characters');
            }

            const results = await consultantSkillService.searchSkills(q, {
                tenantId: this._getTenantId(req),
                category: req.query.category,
                minLevel: parseInt(req.query.minLevel, 10),
                limit: parseInt(req.query.limit, 10) || 50
            });

            this._sendSuccess(res, results, 'Search completed successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Find consultants with specific skills
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async findConsultantsWithSkills(req, res) {
        try {
            const skills = req.body.skills || req.query.skills?.split(',');

            if (!skills || skills.length === 0) {
                throw AppError.validation('At least one skill is required');
            }

            const results = await consultantSkillService.findConsultantsWithSkills(skills, {
                tenantId: this._getTenantId(req),
                minLevel: req.query.minLevel,
                verifiedOnly: req.query.verifiedOnly === 'true',
                limit: parseInt(req.query.limit, 10) || 50
            });

            this._sendSuccess(res, results, 'Consultants found successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // UPDATE OPERATIONS
    // ============================================================================

    /**
     * Update skill record
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} req.body - Update data
     * @param {Object} res - Express response object
     */
    async updateSkillRecord(req, res) {
        try {
            this._validateRequest(req);

            const { skillRecordId } = req.params;

            const skillRecord = await consultantSkillService.updateSkillRecord(skillRecordId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Skill record updated via API', { skillRecordId });

            this._sendSuccess(res, skillRecord, 'Skill record updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // PROFICIENCY ASSESSMENT
    // ============================================================================

    /**
     * Submit proficiency assessment
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} req.body - Assessment data
     * @param {Object} res - Express response object
     */
    async submitProficiencyAssessment(req, res) {
        try {
            this._validateRequest(req);

            const { skillRecordId } = req.params;

            const skillRecord = await consultantSkillService.submitProficiencyAssessment(skillRecordId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Proficiency assessment submitted', {
                skillRecordId,
                type: req.body.type
            });

            this._sendSuccess(res, skillRecord, 'Assessment submitted successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Submit self-assessment (self-service)
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} req.body - Assessment data (level, notes)
     * @param {Object} res - Express response object
     */
    async submitSelfAssessment(req, res) {
        try {
            const { skillRecordId } = req.params;

            const skillRecord = await consultantSkillService.submitProficiencyAssessment(skillRecordId, {
                type: ASSESSMENT_TYPES.SELF,
                level: req.body.level,
                score: req.body.score,
                notes: req.body.notes
            }, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                skipTenantCheck: true
            });

            this._sendSuccess(res, skillRecord, 'Self-assessment submitted successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Request skill assessment from manager or peer
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} req.body - Request data (assessorId, type, message)
     * @param {Object} res - Express response object
     */
    async requestAssessment(req, res) {
        try {
            const { skillRecordId } = req.params;

            const result = await consultantSkillService.requestAssessment(skillRecordId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, result, 'Assessment request sent successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // ENDORSEMENT MANAGEMENT
    // ============================================================================

    /**
     * Add endorsement to skill
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} req.body - Endorsement data
     * @param {Object} res - Express response object
     */
    async addEndorsement(req, res) {
        try {
            this._validateRequest(req);

            const { skillRecordId } = req.params;

            const skillRecord = await consultantSkillService.addEndorsement(skillRecordId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Endorsement added via API', { skillRecordId });

            this._sendSuccess(res, skillRecord, 'Endorsement added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Remove endorsement from skill
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {string} req.params.endorsementId - Endorsement ID
     * @param {Object} res - Express response object
     */
    async removeEndorsement(req, res) {
        try {
            const { skillRecordId, endorsementId } = req.params;

            const skillRecord = await consultantSkillService.removeEndorsement(skillRecordId, endorsementId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, skillRecord, 'Endorsement removed successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // PROJECT EXPERIENCE
    // ============================================================================

    /**
     * Add project experience to skill
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} req.body - Project experience data
     * @param {Object} res - Express response object
     */
    async addProjectExperience(req, res) {
        try {
            this._validateRequest(req);

            const { skillRecordId } = req.params;

            const skillRecord = await consultantSkillService.addProjectExperience(skillRecordId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Project experience added via API', { skillRecordId });

            this._sendSuccess(res, skillRecord, 'Project experience added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Update project experience feedback
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {string} req.params.projectId - Project ID
     * @param {Object} req.body - Feedback data
     * @param {Object} res - Express response object
     */
    async updateProjectFeedback(req, res) {
        try {
            const { skillRecordId, projectId } = req.params;

            const skillRecord = await consultantSkillService.updateProjectFeedback(skillRecordId, projectId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, skillRecord, 'Project feedback updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // TRAINING MANAGEMENT
    // ============================================================================

    /**
     * Add completed course to skill
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} req.body - Course data
     * @param {Object} res - Express response object
     */
    async addCompletedCourse(req, res) {
        try {
            this._validateRequest(req);

            const { skillRecordId } = req.params;

            const skillRecord = await consultantSkillService.addCompletedCourse(skillRecordId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Completed course added via API', { skillRecordId });

            this._sendSuccess(res, skillRecord, 'Course added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Add course enrollment to skill
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} req.body - Enrollment data
     * @param {Object} res - Express response object
     */
    async addCourseEnrollment(req, res) {
        try {
            const { skillRecordId } = req.params;

            const skillRecord = await consultantSkillService.addCourseEnrollment(skillRecordId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, skillRecord, 'Enrollment added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Update course enrollment progress
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {string} req.params.courseId - Course ID
     * @param {Object} req.body - Progress data
     * @param {Object} res - Express response object
     */
    async updateEnrollmentProgress(req, res) {
        try {
            const { skillRecordId, courseId } = req.params;
            const { progress } = req.body;

            if (progress === undefined || progress < 0 || progress > 100) {
                throw AppError.validation('Progress must be between 0 and 100');
            }

            const skillRecord = await consultantSkillService.updateEnrollmentProgress(skillRecordId, courseId, progress, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, skillRecord, 'Progress updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // VERIFICATION
    // ============================================================================

    /**
     * Verify skill through certification
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} req.body - Certification data
     * @param {Object} res - Express response object
     */
    async verifyCertification(req, res) {
        try {
            const { skillRecordId } = req.params;

            const skillRecord = await consultantSkillService.verifyCertification(skillRecordId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Skill verified through certification', { skillRecordId });

            this._sendSuccess(res, skillRecord, 'Skill verified successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // DELETE OPERATIONS
    // ============================================================================

    /**
     * Delete skill record
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.skillRecordId - Skill record ID
     * @param {Object} res - Express response object
     */
    async deleteSkillRecord(req, res) {
        try {
            const { skillRecordId } = req.params;

            const result = await consultantSkillService.deleteSkillRecord(skillRecordId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                hardDelete: req.query.hard === 'true'
            });

            this._sendSuccess(res, result, 'Skill record deleted successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // ANALYTICS & REPORTS
    // ============================================================================

    /**
     * Get skill distribution
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getSkillDistribution(req, res) {
        try {
            const distribution = await consultantSkillService.getSkillDistribution({
                tenantId: this._getTenantId(req),
                consultantId: req.query.consultantId
            });

            this._sendSuccess(res, distribution, 'Skill distribution retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get skill gap analysis for a consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async getSkillGapAnalysis(req, res) {
        try {
            const { consultantId } = req.params;
            const { requiredSkills } = req.body;

            if (!requiredSkills || !Array.isArray(requiredSkills) || requiredSkills.length === 0) {
                throw AppError.validation('Required skills array is needed');
            }

            const analysis = await consultantSkillService.getSkillGapAnalysis(consultantId, requiredSkills, {
                tenantId: this._getTenantId(req)
            });

            this._sendSuccess(res, analysis, 'Skill gap analysis completed');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get organization skill matrix
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getOrganizationSkillMatrix(req, res) {
        try {
            const matrix = await consultantSkillService.getOrganizationSkillMatrix({
                tenantId: this._getTenantId(req),
                skills: req.query.skills?.split(','),
                department: req.query.department,
                limit: parseInt(req.query.limit, 10) || 100
            });

            this._sendSuccess(res, matrix, 'Skill matrix generated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get skill statistics
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getSkillStatistics(req, res) {
        try {
            const stats = await consultantSkillService.getSkillStatistics({
                tenantId: this._getTenantId(req),
                consultantId: req.query.consultantId
            });

            this._sendSuccess(res, stats, 'Statistics retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }
}

// Export singleton instance and class
module.exports = new ConsultantSkillController();
module.exports.ConsultantSkillController = ConsultantSkillController;