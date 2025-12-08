/**
 * @fileoverview Consultant Assignment Controller
 * @module servers/customer-services/modules/core-business/consultant-management/controllers/consultant-assignment-controller
 * @description HTTP request handlers for consultant assignment management operations including
 * assignment CRUD, lifecycle management, approval workflow, time tracking, and reporting
 */

const { validationResult, body, param, query } = require('express-validator');
const consultantAssignmentService = require('../services/consultant-assignment-service');
const {
    ASSIGNMENT_STATUS,
    ASSIGNMENT_ROLES,
    RATE_TYPES,
    APPROVAL_STATUS,
    WORK_LOCATIONS
} = require('../services/consultant-assignment-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-assignment-controller'
});

/**
 * Consultant Assignment Controller
 * Handles HTTP requests for consultant assignment management operations
 * @class ConsultantAssignmentController
 */
class ConsultantAssignmentController {
    constructor() {
        // Bind methods to preserve 'this' context
        this.createAssignment = this.createAssignment.bind(this);
        this.bulkCreateAssignments = this.bulkCreateAssignments.bind(this);
        this.getAssignmentById = this.getAssignmentById.bind(this);
        this.getConsultantAssignments = this.getConsultantAssignments.bind(this);
        this.getMyAssignments = this.getMyAssignments.bind(this);
        this.getProjectAssignments = this.getProjectAssignments.bind(this);
        this.getClientAssignments = this.getClientAssignments.bind(this);
        this.getPendingApprovals = this.getPendingApprovals.bind(this);
        this.updateAssignment = this.updateAssignment.bind(this);
        this.extendAssignment = this.extendAssignment.bind(this);
        this.startAssignment = this.startAssignment.bind(this);
        this.completeAssignment = this.completeAssignment.bind(this);
        this.cancelAssignment = this.cancelAssignment.bind(this);
        this.holdAssignment = this.holdAssignment.bind(this);
        this.resumeAssignment = this.resumeAssignment.bind(this);
        this.approveAssignment = this.approveAssignment.bind(this);
        this.rejectAssignment = this.rejectAssignment.bind(this);
        this.logTime = this.logTime.bind(this);
        this.deleteAssignment = this.deleteAssignment.bind(this);
        this.getCurrentAllocation = this.getCurrentAllocation.bind(this);
        this.getUtilizationReport = this.getUtilizationReport.bind(this);
        this.getRevenueReport = this.getRevenueReport.bind(this);
        this.getAssignmentStatistics = this.getAssignmentStatistics.bind(this);
    }

    // ============================================================================
    // VALIDATION RULES
    // ============================================================================

    /**
     * Validation rules for creating an assignment
     * @static
     * @returns {Array} Express validator chain
     */
    static createValidation() {
        return [
            body('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            body('projectId')
                .notEmpty().withMessage('Project ID is required'),
            body('clientId')
                .notEmpty().withMessage('Client ID is required'),
            body('role')
                .notEmpty().withMessage('Role is required')
                .isIn(Object.values(ASSIGNMENT_ROLES)).withMessage('Invalid assignment role'),
            body('startDate')
                .notEmpty().withMessage('Start date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('endDate')
                .notEmpty().withMessage('End date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('allocationPercentage')
                .optional()
                .isInt({ min: 0, max: 100 }).withMessage('Allocation must be between 0 and 100'),
            body('billing.rate.amount')
                .optional()
                .isFloat({ min: 0 }).withMessage('Rate must be a positive number'),
            body('billing.rate.type')
                .optional()
                .isIn(Object.values(RATE_TYPES)).withMessage('Invalid rate type'),
            body('workLocation')
                .optional()
                .isIn(Object.values(WORK_LOCATIONS)).withMessage('Invalid work location')
        ];
    }

    /**
     * Validation rules for updating an assignment
     * @static
     * @returns {Array} Express validator chain
     */
    static updateValidation() {
        return [
            param('assignmentId')
                .notEmpty().withMessage('Assignment ID is required'),
            body('role')
                .optional()
                .isIn(Object.values(ASSIGNMENT_ROLES)).withMessage('Invalid assignment role'),
            body('startDate')
                .optional()
                .isISO8601().withMessage('Invalid date format'),
            body('endDate')
                .optional()
                .isISO8601().withMessage('Invalid date format'),
            body('allocationPercentage')
                .optional()
                .isInt({ min: 0, max: 100 }).withMessage('Allocation must be between 0 and 100'),
            body('billing.rate.amount')
                .optional()
                .isFloat({ min: 0 }).withMessage('Rate must be a positive number'),
            body('workLocation')
                .optional()
                .isIn(Object.values(WORK_LOCATIONS)).withMessage('Invalid work location')
        ];
    }

    /**
     * Validation rules for listing assignments
     * @static
     * @returns {Array} Express validator chain
     */
    static listValidation() {
        return [
            query('status')
                .optional()
                .isIn(Object.values(ASSIGNMENT_STATUS)).withMessage('Invalid status'),
            query('role')
                .optional()
                .isIn(Object.values(ASSIGNMENT_ROLES)).withMessage('Invalid role'),
            query('startDate')
                .optional()
                .isISO8601().withMessage('Invalid start date format'),
            query('endDate')
                .optional()
                .isISO8601().withMessage('Invalid end date format'),
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
     * Validation rules for time logging
     * @static
     * @returns {Array} Express validator chain
     */
    static timeLogValidation() {
        return [
            param('assignmentId')
                .notEmpty().withMessage('Assignment ID is required'),
            body('date')
                .notEmpty().withMessage('Date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('hours')
                .notEmpty().withMessage('Hours is required')
                .isFloat({ min: 0, max: 24 }).withMessage('Hours must be between 0 and 24'),
            body('description')
                .optional()
                .isLength({ max: 500 }).withMessage('Description must be at most 500 characters'),
            body('billable')
                .optional()
                .isBoolean().withMessage('Billable must be a boolean')
        ];
    }

    /**
     * Validation rules for extending assignment
     * @static
     * @returns {Array} Express validator chain
     */
    static extendValidation() {
        return [
            param('assignmentId')
                .notEmpty().withMessage('Assignment ID is required'),
            body('newEndDate')
                .notEmpty().withMessage('New end date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('reason')
                .optional()
                .isLength({ max: 500 }).withMessage('Reason must be at most 500 characters')
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
     * Create a new assignment
     * @async
     * @param {Object} req - Express request object
     * @param {Object} req.body - Assignment data
     * @param {Object} res - Express response object
     */
    async createAssignment(req, res) {
        try {
            this._validateRequest(req);

            const assignment = await consultantAssignmentService.createAssignment(req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Assignment created via API', {
                assignmentId: assignment.assignmentCode,
                consultantId: req.body.consultantId,
                projectId: req.body.projectId
            });

            this._sendSuccess(res, assignment, 'Assignment created successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Bulk create assignments
     * @async
     * @param {Object} req - Express request object
     * @param {Array} req.body.assignments - Array of assignment data
     * @param {Object} res - Express response object
     */
    async bulkCreateAssignments(req, res) {
        try {
            const { assignments } = req.body;

            if (!Array.isArray(assignments) || assignments.length === 0) {
                throw AppError.validation('Assignments array is required');
            }

            const results = await consultantAssignmentService.bulkCreateAssignments(assignments, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Bulk assignment creation completed', {
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
     * Get assignment by ID
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} res - Express response object
     */
    async getAssignmentById(req, res) {
        try {
            const { assignmentId } = req.params;

            const assignment = await consultantAssignmentService.getAssignmentById(assignmentId, {
                tenantId: this._getTenantId(req),
                populate: req.query.populate === 'true'
            });

            this._sendSuccess(res, assignment, 'Assignment retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get consultant's assignments
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async getConsultantAssignments(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const result = await consultantAssignmentService.getConsultantAssignments(consultantId, {
                tenantId: this._getTenantId(req),
                status: req.query.status,
                role: req.query.role,
                startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
                activeOnly: req.query.activeOnly === 'true',
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            });

            this._sendSuccess(res, result, 'Assignments retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get current user's assignments (self-service)
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getMyAssignments(req, res) {
        try {
            // Get consultant by user ID first
            const consultantService = require('../services/consultant-service');
            const consultant = await consultantService.getConsultantByUserId(this._getUserId(req), {
                tenantId: this._getTenantId(req),
                skipTenantCheck: true
            });

            const result = await consultantAssignmentService.getConsultantAssignments(consultant._id, {
                tenantId: this._getTenantId(req),
                skipTenantCheck: true,
                status: req.query.status,
                activeOnly: req.query.activeOnly !== 'false',
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0
            });

            this._sendSuccess(res, result, 'Assignments retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get project assignments
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.projectId - Project ID
     * @param {Object} res - Express response object
     */
    async getProjectAssignments(req, res) {
        try {
            const { projectId } = req.params;

            const result = await consultantAssignmentService.getProjectAssignments(projectId, {
                tenantId: this._getTenantId(req),
                status: req.query.status,
                activeOnly: req.query.activeOnly === 'true',
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0
            });

            this._sendSuccess(res, result, 'Project assignments retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get client assignments
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.clientId - Client ID
     * @param {Object} res - Express response object
     */
    async getClientAssignments(req, res) {
        try {
            const { clientId } = req.params;

            const result = await consultantAssignmentService.getClientAssignments(clientId, {
                tenantId: this._getTenantId(req),
                status: req.query.status,
                activeOnly: req.query.activeOnly === 'true',
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0
            });

            this._sendSuccess(res, result, 'Client assignments retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get pending approvals
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getPendingApprovals(req, res) {
        try {
            const result = await consultantAssignmentService.getPendingApprovals({
                tenantId: this._getTenantId(req),
                approverType: req.query.approverType,
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0
            });

            this._sendSuccess(res, result, 'Pending approvals retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // UPDATE OPERATIONS
    // ============================================================================

    /**
     * Update assignment
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} req.body - Update data
     * @param {Object} res - Express response object
     */
    async updateAssignment(req, res) {
        try {
            this._validateRequest(req);

            const { assignmentId } = req.params;

            const assignment = await consultantAssignmentService.updateAssignment(assignmentId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Assignment updated via API', { assignmentId });

            this._sendSuccess(res, assignment, 'Assignment updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Extend assignment
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} req.body - Extension data (newEndDate, reason)
     * @param {Object} res - Express response object
     */
    async extendAssignment(req, res) {
        try {
            this._validateRequest(req);

            const { assignmentId } = req.params;

            const assignment = await consultantAssignmentService.extendAssignment(assignmentId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Assignment extended via API', { assignmentId });

            this._sendSuccess(res, assignment, 'Assignment extended successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // LIFECYCLE MANAGEMENT
    // ============================================================================

    /**
     * Start assignment
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} res - Express response object
     */
    async startAssignment(req, res) {
        try {
            const { assignmentId } = req.params;

            const assignment = await consultantAssignmentService.startAssignment(assignmentId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                actualStartDate: req.body.actualStartDate
            });

            logger.info('Assignment started via API', { assignmentId });

            this._sendSuccess(res, assignment, 'Assignment started successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Complete assignment
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} req.body - Completion data (actualEndDate, summary, feedback)
     * @param {Object} res - Express response object
     */
    async completeAssignment(req, res) {
        try {
            const { assignmentId } = req.params;

            const assignment = await consultantAssignmentService.completeAssignment(assignmentId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Assignment completed via API', { assignmentId });

            this._sendSuccess(res, assignment, 'Assignment completed successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Cancel assignment
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} req.body - Cancellation data (reason)
     * @param {Object} res - Express response object
     */
    async cancelAssignment(req, res) {
        try {
            const { assignmentId } = req.params;

            if (!req.body.reason) {
                throw AppError.validation('Cancellation reason is required');
            }

            const assignment = await consultantAssignmentService.cancelAssignment(assignmentId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                reason: req.body.reason
            });

            logger.info('Assignment cancelled via API', { assignmentId });

            this._sendSuccess(res, assignment, 'Assignment cancelled successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Put assignment on hold
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} req.body - Hold data (reason, expectedResumeDate)
     * @param {Object} res - Express response object
     */
    async holdAssignment(req, res) {
        try {
            const { assignmentId } = req.params;

            const assignment = await consultantAssignmentService.holdAssignment(assignmentId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                reason: req.body.reason,
                expectedResumeDate: req.body.expectedResumeDate
            });

            logger.info('Assignment put on hold via API', { assignmentId });

            this._sendSuccess(res, assignment, 'Assignment put on hold successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Resume assignment from hold
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} res - Express response object
     */
    async resumeAssignment(req, res) {
        try {
            const { assignmentId } = req.params;

            const assignment = await consultantAssignmentService.resumeAssignment(assignmentId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Assignment resumed via API', { assignmentId });

            this._sendSuccess(res, assignment, 'Assignment resumed successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // APPROVAL WORKFLOW
    // ============================================================================

    /**
     * Approve assignment
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} req.body - Approval data (comments)
     * @param {Object} res - Express response object
     */
    async approveAssignment(req, res) {
        try {
            const { assignmentId } = req.params;

            const assignment = await consultantAssignmentService.approveAssignment(assignmentId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                comments: req.body.comments
            });

            logger.info('Assignment approved via API', { assignmentId });

            this._sendSuccess(res, assignment, 'Assignment approved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Reject assignment
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} req.body - Rejection data (reason)
     * @param {Object} res - Express response object
     */
    async rejectAssignment(req, res) {
        try {
            const { assignmentId } = req.params;

            if (!req.body.reason) {
                throw AppError.validation('Rejection reason is required');
            }

            const assignment = await consultantAssignmentService.rejectAssignment(assignmentId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                reason: req.body.reason
            });

            logger.info('Assignment rejected via API', { assignmentId });

            this._sendSuccess(res, assignment, 'Assignment rejected');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // TIME TRACKING
    // ============================================================================

    /**
     * Log time for assignment
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} req.body - Time log data
     * @param {Object} res - Express response object
     */
    async logTime(req, res) {
        try {
            this._validateRequest(req);

            const { assignmentId } = req.params;

            const assignment = await consultantAssignmentService.logTime(assignmentId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Time logged via API', {
                assignmentId,
                hours: req.body.hours
            });

            this._sendSuccess(res, assignment, 'Time logged successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // DELETE OPERATIONS
    // ============================================================================

    /**
     * Delete assignment
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.assignmentId - Assignment ID
     * @param {Object} res - Express response object
     */
    async deleteAssignment(req, res) {
        try {
            const { assignmentId } = req.params;

            const result = await consultantAssignmentService.deleteAssignment(assignmentId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                hardDelete: req.query.hard === 'true'
            });

            this._sendSuccess(res, result, 'Assignment deleted successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // REPORTS & ANALYTICS
    // ============================================================================

    /**
     * Get current allocation for a consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async getCurrentAllocation(req, res) {
        try {
            const { consultantId } = req.params;

            const allocation = await consultantAssignmentService.getCurrentAllocation(consultantId, {
                tenantId: this._getTenantId(req),
                asOfDate: req.query.asOfDate ? new Date(req.query.asOfDate) : new Date()
            });

            this._sendSuccess(res, allocation, 'Allocation retrieved successfully');

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
            const report = await consultantAssignmentService.getUtilizationReport({
                tenantId: this._getTenantId(req),
                consultantId: req.query.consultantId,
                departmentId: req.query.departmentId,
                startDate: req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                endDate: req.query.endDate ? new Date(req.query.endDate) : new Date()
            });

            this._sendSuccess(res, report, 'Utilization report generated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get revenue report
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getRevenueReport(req, res) {
        try {
            const report = await consultantAssignmentService.getRevenueReport({
                tenantId: this._getTenantId(req),
                consultantId: req.query.consultantId,
                projectId: req.query.projectId,
                clientId: req.query.clientId,
                startDate: req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                endDate: req.query.endDate ? new Date(req.query.endDate) : new Date()
            });

            this._sendSuccess(res, report, 'Revenue report generated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get assignment statistics
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getAssignmentStatistics(req, res) {
        try {
            const stats = await consultantAssignmentService.getAssignmentStatistics({
                tenantId: this._getTenantId(req),
                consultantId: req.query.consultantId,
                projectId: req.query.projectId,
                clientId: req.query.clientId
            });

            this._sendSuccess(res, stats, 'Statistics retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }
}

// Export singleton instance and class
module.exports = new ConsultantAssignmentController();
module.exports.ConsultantAssignmentController = ConsultantAssignmentController;