/**
 * @fileoverview Consultant Controller
 * @module servers/customer-services/modules/core-business/consultant-management/controllers/consultant-controller
 * @description HTTP request handlers for consultant management operations including CRUD,
 * profile management, skills, certifications, performance, compliance, and status lifecycle
 */

const { validationResult, body, param, query } = require('express-validator');
const consultantService = require('../services/consultant-service');
const {
    CONSULTANT_STATUS,
    PROFESSIONAL_LEVEL,
    EMPLOYMENT_TYPE,
    AVAILABILITY_STATUS,
    DOCUMENT_TYPES
} = require('../services/consultant-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-controller'
});

/**
 * Consultant Controller
 * Handles HTTP requests for consultant management operations
 * @class ConsultantController
 */
class ConsultantController {
    constructor() {
        // Bind methods to preserve 'this' context
        this.createConsultant = this.createConsultant.bind(this);
        this.bulkCreateConsultants = this.bulkCreateConsultants.bind(this);
        this.getConsultantById = this.getConsultantById.bind(this);
        this.getConsultantByUserId = this.getConsultantByUserId.bind(this);
        this.getMyProfile = this.getMyProfile.bind(this);
        this.listConsultants = this.listConsultants.bind(this);
        this.searchConsultants = this.searchConsultants.bind(this);
        this.findAvailableConsultants = this.findAvailableConsultants.bind(this);
        this.getDirectReports = this.getDirectReports.bind(this);
        this.updateConsultant = this.updateConsultant.bind(this);
        this.updateMyProfile = this.updateMyProfile.bind(this);
        this.updateAvailability = this.updateAvailability.bind(this);
        this.addBlackoutDates = this.addBlackoutDates.bind(this);
        this.addSkill = this.addSkill.bind(this);
        this.updateSkill = this.updateSkill.bind(this);
        this.removeSkill = this.removeSkill.bind(this);
        this.verifySkill = this.verifySkill.bind(this);
        this.addCertification = this.addCertification.bind(this);
        this.updateCertification = this.updateCertification.bind(this);
        this.removeCertification = this.removeCertification.bind(this);
        this.addEducation = this.addEducation.bind(this);
        this.addWorkHistory = this.addWorkHistory.bind(this);
        this.addDocument = this.addDocument.bind(this);
        this.removeDocument = this.removeDocument.bind(this);
        this.addPerformanceReview = this.addPerformanceReview.bind(this);
        this.addFeedback = this.addFeedback.bind(this);
        this.addAchievement = this.addAchievement.bind(this);
        this.updateComplianceStatus = this.updateComplianceStatus.bind(this);
        this.addConflictOfInterestDeclaration = this.addConflictOfInterestDeclaration.bind(this);
        this.activateConsultant = this.activateConsultant.bind(this);
        this.deactivateConsultant = this.deactivateConsultant.bind(this);
        this.putOnLeave = this.putOnLeave.bind(this);
        this.suspendConsultant = this.suspendConsultant.bind(this);
        this.terminateConsultant = this.terminateConsultant.bind(this);
        this.deleteConsultant = this.deleteConsultant.bind(this);
        this.getConsultantStatistics = this.getConsultantStatistics.bind(this);
        this.searchBySkills = this.searchBySkills.bind(this);
        this.getUtilizationReport = this.getUtilizationReport.bind(this);
    }

    // ============================================================================
    // VALIDATION RULES
    // ============================================================================

    /**
     * Validation rules for creating a consultant
     * @static
     * @returns {Array} Express validator chain
     */
    static createValidation() {
        return [
            body('profile.firstName')
                .trim()
                .notEmpty().withMessage('First name is required')
                .isLength({ max: 100 }).withMessage('First name must be at most 100 characters'),
            body('profile.lastName')
                .trim()
                .notEmpty().withMessage('Last name is required')
                .isLength({ max: 100 }).withMessage('Last name must be at most 100 characters'),
            body('contact.email.primary')
                .trim()
                .notEmpty().withMessage('Primary email is required')
                .isEmail().withMessage('Invalid email format')
                .normalizeEmail(),
            body('professional.startDate')
                .notEmpty().withMessage('Start date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('professional.employmentType')
                .optional()
                .isIn(Object.values(EMPLOYMENT_TYPE)).withMessage('Invalid employment type'),
            body('professional.level')
                .optional()
                .isIn(Object.values(PROFESSIONAL_LEVEL)).withMessage('Invalid professional level'),
            body('billing.defaultRate.amount')
                .optional()
                .isFloat({ min: 0 }).withMessage('Rate must be a positive number'),
            body('profile.bio')
                .optional()
                .isLength({ max: 5000 }).withMessage('Bio must be at most 5000 characters'),
            body('profile.summary')
                .optional()
                .isLength({ max: 1000 }).withMessage('Summary must be at most 1000 characters')
        ];
    }

    /**
     * Validation rules for updating a consultant
     * @static
     * @returns {Array} Express validator chain
     */
    static updateValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            body('profile.firstName')
                .optional()
                .trim()
                .isLength({ max: 100 }).withMessage('First name must be at most 100 characters'),
            body('profile.lastName')
                .optional()
                .trim()
                .isLength({ max: 100 }).withMessage('Last name must be at most 100 characters'),
            body('contact.email.primary')
                .optional()
                .isEmail().withMessage('Invalid email format')
                .normalizeEmail(),
            body('professional.employmentType')
                .optional()
                .isIn(Object.values(EMPLOYMENT_TYPE)).withMessage('Invalid employment type'),
            body('professional.level')
                .optional()
                .isIn(Object.values(PROFESSIONAL_LEVEL)).withMessage('Invalid professional level'),
            body('billing.defaultRate.amount')
                .optional()
                .isFloat({ min: 0 }).withMessage('Rate must be a positive number')
        ];
    }

    /**
     * Validation rules for listing consultants
     * @static
     * @returns {Array} Express validator chain
     */
    static listValidation() {
        return [
            query('status')
                .optional()
                .isIn(Object.values(CONSULTANT_STATUS)).withMessage('Invalid status'),
            query('level')
                .optional()
                .isIn(Object.values(PROFESSIONAL_LEVEL)).withMessage('Invalid level'),
            query('employmentType')
                .optional()
                .isIn(Object.values(EMPLOYMENT_TYPE)).withMessage('Invalid employment type'),
            query('availabilityStatus')
                .optional()
                .isIn(Object.values(AVAILABILITY_STATUS)).withMessage('Invalid availability status'),
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
     * Validation rules for availability update
     * @static
     * @returns {Array} Express validator chain
     */
    static availabilityValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            body('status')
                .optional()
                .isIn(Object.values(AVAILABILITY_STATUS)).withMessage('Invalid availability status'),
            body('capacityPercentage')
                .optional()
                .isInt({ min: 0, max: 100 }).withMessage('Capacity must be between 0 and 100'),
            body('hoursPerWeek')
                .optional()
                .isInt({ min: 0, max: 80 }).withMessage('Hours per week must be between 0 and 80')
        ];
    }

    /**
     * Validation rules for adding a skill
     * @static
     * @returns {Array} Express validator chain
     */
    static addSkillValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            body('name')
                .trim()
                .notEmpty().withMessage('Skill name is required')
                .isLength({ max: 100 }).withMessage('Skill name must be at most 100 characters'),
            body('category')
                .optional()
                .isIn(['technical', 'functional', 'domain', 'soft_skill', 'tool', 'methodology', 'language', 'other'])
                .withMessage('Invalid skill category'),
            body('proficiencyLevel')
                .optional()
                .isIn(['beginner', 'intermediate', 'advanced', 'expert', 'master'])
                .withMessage('Invalid proficiency level'),
            body('yearsOfExperience')
                .optional()
                .isFloat({ min: 0, max: 50 }).withMessage('Years of experience must be between 0 and 50')
        ];
    }

    /**
     * Validation rules for adding a certification
     * @static
     * @returns {Array} Express validator chain
     */
    static addCertificationValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            body('name')
                .trim()
                .notEmpty().withMessage('Certification name is required'),
            body('issuingOrganization')
                .trim()
                .notEmpty().withMessage('Issuing organization is required'),
            body('issueDate')
                .notEmpty().withMessage('Issue date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('expirationDate')
                .optional()
                .isISO8601().withMessage('Invalid date format')
        ];
    }

    /**
     * Validation rules for adding a performance review
     * @static
     * @returns {Array} Express validator chain
     */
    static addReviewValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            body('type')
                .notEmpty().withMessage('Review type is required')
                .isIn(['annual', 'mid_year', 'quarterly', 'project', '360', 'probation'])
                .withMessage('Invalid review type'),
            body('overallRating')
                .notEmpty().withMessage('Overall rating is required')
                .isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5')
        ];
    }

    /**
     * Validation rules for adding a document
     * @static
     * @returns {Array} Express validator chain
     */
    static addDocumentValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            body('type')
                .notEmpty().withMessage('Document type is required')
                .isIn(Object.values(DOCUMENT_TYPES)).withMessage('Invalid document type'),
            body('url')
                .notEmpty().withMessage('Document URL is required')
                .isURL().withMessage('Invalid URL format')
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
     * Create a new consultant
     * @async
     * @param {Object} req - Express request object
     * @param {Object} req.body - Consultant data
     * @param {Object} res - Express response object
     */
    async createConsultant(req, res) {
        try {
            this._validateRequest(req);

            const consultant = await consultantService.createConsultant(req.body, {
                tenantId: this._getTenantId(req),
                organizationId: req.body.organizationId,
                userId: this._getUserId(req),
                source: req.body.source || 'manual',
                sendWelcome: req.body.sendWelcome !== false
            });

            logger.info('Consultant created via API', {
                consultantId: consultant._id,
                consultantCode: consultant.consultantCode
            });

            this._sendSuccess(res, consultant, 'Consultant created successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Bulk create consultants
     * @async
     * @param {Object} req - Express request object
     * @param {Array} req.body.consultants - Array of consultant data
     * @param {Object} res - Express response object
     */
    async bulkCreateConsultants(req, res) {
        try {
            const { consultants } = req.body;

            if (!Array.isArray(consultants) || consultants.length === 0) {
                throw AppError.validation('Consultants array is required');
            }

            const results = await consultantService.bulkCreateConsultants(consultants, {
                tenantId: this._getTenantId(req),
                organizationId: req.body.organizationId,
                userId: this._getUserId(req),
                source: req.body.source || 'import'
            });

            logger.info('Bulk consultant creation completed', {
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
     * Get consultant by ID
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async getConsultantById(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.getConsultantById(consultantId, {
                tenantId: this._getTenantId(req),
                populate: req.query.populate === 'true',
                select: req.query.select?.split(',')
            });

            this._sendSuccess(res, consultant, 'Consultant retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get consultant by user ID
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.userId - User ID
     * @param {Object} res - Express response object
     */
    async getConsultantByUserId(req, res) {
        try {
            const { userId } = req.params;

            const consultant = await consultantService.getConsultantByUserId(userId, {
                tenantId: this._getTenantId(req)
            });

            this._sendSuccess(res, consultant, 'Consultant retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get current user's consultant profile (self-service)
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getMyProfile(req, res) {
        try {
            const userId = this._getUserId(req);

            const consultant = await consultantService.getConsultantByUserId(userId, {
                tenantId: this._getTenantId(req),
                skipTenantCheck: true
            });

            this._sendSuccess(res, consultant, 'Profile retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * List consultants with filtering
     * @async
     * @param {Object} req - Express request object
     * @param {Object} req.query - Filter and pagination parameters
     * @param {Object} res - Express response object
     */
    async listConsultants(req, res) {
        try {
            this._validateRequest(req);

            const filters = {
                status: req.query.status,
                level: req.query.level,
                employmentType: req.query.employmentType,
                department: req.query.department,
                team: req.query.team,
                manager: req.query.manager,
                availabilityStatus: req.query.availabilityStatus,
                skills: req.query.skills?.split(','),
                tags: req.query.tags?.split(','),
                search: req.query.search
            };

            const options = {
                tenantId: this._getTenantId(req),
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            };

            const result = await consultantService.listConsultants(filters, options);

            this._sendSuccess(res, result, 'Consultants retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Search consultants
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.query.q - Search query
     * @param {Object} res - Express response object
     */
    async searchConsultants(req, res) {
        try {
            const { q } = req.query;

            if (!q || q.trim().length < 2) {
                throw AppError.validation('Search query must be at least 2 characters');
            }

            const results = await consultantService.searchConsultants(q, {
                tenantId: this._getTenantId(req),
                limit: parseInt(req.query.limit, 10) || 20
            });

            this._sendSuccess(res, results, 'Search completed successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Find available consultants
     * @async
     * @param {Object} req - Express request object
     * @param {Object} req.query - Search criteria
     * @param {Object} res - Express response object
     */
    async findAvailableConsultants(req, res) {
        try {
            const criteria = {
                minCapacity: parseInt(req.query.minCapacity, 10),
                skills: req.query.skills?.split(','),
                level: req.query.level,
                availableFrom: req.query.availableFrom,
                availableUntil: req.query.availableUntil,
                remotePreference: req.query.remotePreference
            };

            const results = await consultantService.findAvailableConsultants(criteria, {
                tenantId: this._getTenantId(req),
                limit: parseInt(req.query.limit, 10) || 50
            });

            this._sendSuccess(res, results, 'Available consultants retrieved');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get direct reports for a consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Manager consultant ID
     * @param {Object} res - Express response object
     */
    async getDirectReports(req, res) {
        try {
            const { consultantId } = req.params;

            const directReports = await consultantService.getDirectReports(consultantId, {
                tenantId: this._getTenantId(req)
            });

            this._sendSuccess(res, directReports, 'Direct reports retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // UPDATE OPERATIONS
    // ============================================================================

    /**
     * Update consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Update data
     * @param {Object} res - Express response object
     */
    async updateConsultant(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const consultant = await consultantService.updateConsultant(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Consultant updated via API', { consultantId });

            this._sendSuccess(res, consultant, 'Consultant updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Update current user's consultant profile (self-service)
     * @async
     * @param {Object} req - Express request object
     * @param {Object} req.body - Update data
     * @param {Object} res - Express response object
     */
    async updateMyProfile(req, res) {
        try {
            const userId = this._getUserId(req);

            // First get consultant by user ID
            const existing = await consultantService.getConsultantByUserId(userId, {
                tenantId: this._getTenantId(req),
                skipTenantCheck: true
            });

            // Then update with skipTenantCheck
            const consultant = await consultantService.updateConsultant(existing._id, req.body, {
                tenantId: this._getTenantId(req),
                userId,
                skipTenantCheck: true
            });

            this._sendSuccess(res, consultant, 'Profile updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Update consultant availability
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Availability data
     * @param {Object} res - Express response object
     */
    async updateAvailability(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const consultant = await consultantService.updateAvailability(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Availability updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Add blackout dates
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Blackout data
     * @param {Object} res - Express response object
     */
    async addBlackoutDates(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.addBlackoutDates(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Blackout dates added successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // SKILLS MANAGEMENT
    // ============================================================================

    /**
     * Add skill to consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Skill data
     * @param {Object} res - Express response object
     */
    async addSkill(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const consultant = await consultantService.addSkill(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Skill added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Update consultant skill
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {string} req.params.skillName - Skill name
     * @param {Object} req.body - Skill update data
     * @param {Object} res - Express response object
     */
    async updateSkill(req, res) {
        try {
            const { consultantId, skillName } = req.params;

            const consultant = await consultantService.updateSkill(consultantId, skillName, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Skill updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Remove skill from consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {string} req.params.skillName - Skill name
     * @param {Object} res - Express response object
     */
    async removeSkill(req, res) {
        try {
            const { consultantId, skillName } = req.params;

            const consultant = await consultantService.removeSkill(consultantId, skillName, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Skill removed successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Verify consultant skill
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {string} req.params.skillName - Skill name
     * @param {Object} res - Express response object
     */
    async verifySkill(req, res) {
        try {
            const { consultantId, skillName } = req.params;

            const consultant = await consultantService.verifySkill(consultantId, skillName, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Skill verified successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // CERTIFICATIONS MANAGEMENT
    // ============================================================================

    /**
     * Add certification to consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Certification data
     * @param {Object} res - Express response object
     */
    async addCertification(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const consultant = await consultantService.addCertification(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Certification added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Update consultant certification
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {string} req.params.certificationId - Certification ID
     * @param {Object} req.body - Certification update data
     * @param {Object} res - Express response object
     */
    async updateCertification(req, res) {
        try {
            const { consultantId, certificationId } = req.params;

            const consultant = await consultantService.updateCertification(consultantId, certificationId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Certification updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Remove certification from consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {string} req.params.certificationId - Certification ID
     * @param {Object} res - Express response object
     */
    async removeCertification(req, res) {
        try {
            const { consultantId, certificationId } = req.params;

            const consultant = await consultantService.removeCertification(consultantId, certificationId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Certification removed successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // EDUCATION & WORK HISTORY
    // ============================================================================

    /**
     * Add education to consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Education data
     * @param {Object} res - Express response object
     */
    async addEducation(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.addEducation(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Education added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Add work history to consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Work history data
     * @param {Object} res - Express response object
     */
    async addWorkHistory(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.addWorkHistory(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Work history added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // DOCUMENTS MANAGEMENT
    // ============================================================================

    /**
     * Add document to consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Document data
     * @param {Object} res - Express response object
     */
    async addDocument(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const consultant = await consultantService.addDocument(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Document added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Remove document from consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {string} req.params.documentId - Document ID
     * @param {Object} res - Express response object
     */
    async removeDocument(req, res) {
        try {
            const { consultantId, documentId } = req.params;

            const consultant = await consultantService.removeDocument(consultantId, documentId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Document removed successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // PERFORMANCE MANAGEMENT
    // ============================================================================

    /**
     * Add performance review
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Review data
     * @param {Object} res - Express response object
     */
    async addPerformanceReview(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const consultant = await consultantService.addPerformanceReview(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Performance review added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Add feedback for consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Feedback data
     * @param {Object} res - Express response object
     */
    async addFeedback(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.addFeedback(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Feedback added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Add achievement for consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Achievement data
     * @param {Object} res - Express response object
     */
    async addAchievement(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.addAchievement(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Achievement added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // COMPLIANCE MANAGEMENT
    // ============================================================================

    /**
     * Update compliance status
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Compliance data
     * @param {Object} res - Express response object
     */
    async updateComplianceStatus(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.updateComplianceStatus(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Compliance status updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Add conflict of interest declaration
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Declaration data
     * @param {Object} res - Express response object
     */
    async addConflictOfInterestDeclaration(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.addConflictOfInterestDeclaration(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Declaration added successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // STATUS LIFECYCLE MANAGEMENT
    // ============================================================================

    /**
     * Activate consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async activateConsultant(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.activateConsultant(consultantId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Consultant activated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Deactivate consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Deactivation data (reason, returnDate)
     * @param {Object} res - Express response object
     */
    async deactivateConsultant(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.deactivateConsultant(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Consultant deactivated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Put consultant on leave
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Leave data (reason, returnDate)
     * @param {Object} res - Express response object
     */
    async putOnLeave(req, res) {
        try {
            const { consultantId } = req.params;

            const consultant = await consultantService.putOnLeave(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Consultant put on leave successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Suspend consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Suspension data (reason)
     * @param {Object} res - Express response object
     */
    async suspendConsultant(req, res) {
        try {
            const { consultantId } = req.params;

            if (!req.body.reason) {
                throw AppError.validation('Suspension reason is required');
            }

            const consultant = await consultantService.suspendConsultant(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Consultant suspended successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Terminate consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Termination data (reason, terminationDate)
     * @param {Object} res - Express response object
     */
    async terminateConsultant(req, res) {
        try {
            const { consultantId } = req.params;

            if (!req.body.reason) {
                throw AppError.validation('Termination reason is required');
            }

            const consultant = await consultantService.terminateConsultant(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            this._sendSuccess(res, consultant, 'Consultant terminated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // DELETE OPERATIONS
    // ============================================================================

    /**
     * Delete consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async deleteConsultant(req, res) {
        try {
            const { consultantId } = req.params;

            const result = await consultantService.deleteConsultant(consultantId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                hardDelete: req.query.hard === 'true'
            });

            this._sendSuccess(res, result, 'Consultant deleted successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // STATISTICS & REPORTS
    // ============================================================================

    /**
     * Get consultant statistics
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getConsultantStatistics(req, res) {
        try {
            const stats = await consultantService.getConsultantStatistics({
                tenantId: this._getTenantId(req),
                organizationId: req.query.organizationId
            });

            this._sendSuccess(res, stats, 'Statistics retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Search consultants by skills
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async searchBySkills(req, res) {
        try {
            const skills = req.body.skills || req.query.skills?.split(',');

            if (!skills || skills.length === 0) {
                throw AppError.validation('At least one skill is required');
            }

            const results = await consultantService.searchBySkills(skills, {
                tenantId: this._getTenantId(req),
                limit: parseInt(req.query.limit, 10) || 20
            });

            this._sendSuccess(res, results, 'Search completed successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get utilization report
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getUtilizationReport(req, res) {
        try {
            const { consultantId } = req.params;
            const { startDate, endDate } = req.query;

            const report = await consultantService.getUtilizationReport(
                consultantId,
                startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                endDate ? new Date(endDate) : new Date(),
                {
                    tenantId: this._getTenantId(req)
                }
            );

            this._sendSuccess(res, report, 'Utilization report generated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }
}

// Export singleton instance and class
module.exports = new ConsultantController();
module.exports.ConsultantController = ConsultantController;