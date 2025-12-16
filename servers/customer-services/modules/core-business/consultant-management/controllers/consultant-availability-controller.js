/**
 * @fileoverview Consultant Availability Controller
 * @module servers/customer-services/modules/core-business/consultant-management/controllers/consultant-availability-controller
 * @description HTTP request handlers for consultant availability management operations including
 * availability records, time-off requests, capacity planning, and availability reporting
 */

const { validationResult, body, param, query } = require('express-validator');
const consultantAvailabilityService = require('../services/consultant-availability-service');
const {
    AVAILABILITY_TYPES,
    AVAILABILITY_STATUS,
    TIME_OFF_REASONS,
    APPROVAL_STATUS,
    RECURRENCE_PATTERNS
} = require('../services/consultant-availability-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-availability-controller'
});

/**
 * Consultant Availability Controller
 * Handles HTTP requests for consultant availability management operations
 * @class ConsultantAvailabilityController
 */
class ConsultantAvailabilityController {
    constructor() {
        // Bind methods to preserve 'this' context
        this.createAvailability = this.createAvailability.bind(this);
        this.createTimeOffRequest = this.createTimeOffRequest.bind(this);
        this.bulkCreateAvailability = this.bulkCreateAvailability.bind(this);
        this.getAvailabilityById = this.getAvailabilityById.bind(this);
        this.getConsultantAvailability = this.getConsultantAvailability.bind(this);
        this.getMyAvailability = this.getMyAvailability.bind(this);
        this.getBulkConsultantAvailability = this.getBulkConsultantAvailability.bind(this);
        this.getPendingTimeOffRequests = this.getPendingTimeOffRequests.bind(this);
        this.updateAvailability = this.updateAvailability.bind(this);
        this.approveTimeOff = this.approveTimeOff.bind(this);
        this.rejectTimeOff = this.rejectTimeOff.bind(this);
        this.cancelTimeOff = this.cancelTimeOff.bind(this);
        this.deleteAvailability = this.deleteAvailability.bind(this);
        this.getConsultantCapacity = this.getConsultantCapacity.bind(this);
        this.findAvailableConsultants = this.findAvailableConsultants.bind(this);
        this.checkConflicts = this.checkConflicts.bind(this);
        this.getTimeOffBalance = this.getTimeOffBalance.bind(this);
        this.getCapacityReport = this.getCapacityReport.bind(this);
        this.getAvailabilityStatistics = this.getAvailabilityStatistics.bind(this);
    }

    // ============================================================================
    // VALIDATION RULES
    // ============================================================================

    /**
     * Validation rules for creating availability
     * @static
     * @returns {Array} Express validator chain
     */
    static createValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            body('type')
                .notEmpty().withMessage('Availability type is required')
                .isIn(Object.values(AVAILABILITY_TYPES)).withMessage('Invalid availability type'),
            body('period.startDate')
                .notEmpty().withMessage('Start date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('period.endDate')
                .notEmpty().withMessage('End date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('period.timezone')
                .optional()
                .isString().withMessage('Timezone must be a string'),
            body('period.allDay')
                .optional()
                .isBoolean().withMessage('All day must be a boolean'),
            body('availabilityStatus')
                .optional()
                .isIn(Object.values(AVAILABILITY_STATUS)).withMessage('Invalid availability status'),
            body('capacity.percentageAvailable')
                .optional()
                .isInt({ min: 0, max: 100 }).withMessage('Capacity percentage must be between 0 and 100'),
            body('capacity.hoursAvailable')
                .optional()
                .isFloat({ min: 0, max: 24 }).withMessage('Hours available must be between 0 and 24')
        ];
    }

    /**
     * Validation rules for creating time-off request
     * @static
     * @returns {Array} Express validator chain
     */
    static timeOffValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            body('period.startDate')
                .notEmpty().withMessage('Start date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('period.endDate')
                .notEmpty().withMessage('End date is required')
                .isISO8601().withMessage('Invalid date format'),
            body('timeOff.reason')
                .notEmpty().withMessage('Time-off reason is required')
                .isIn(Object.values(TIME_OFF_REASONS)).withMessage('Invalid time-off reason'),
            body('timeOff.description')
                .optional()
                .isLength({ max: 1000 }).withMessage('Description must be at most 1000 characters')
        ];
    }

    /**
     * Validation rules for updating availability
     * @static
     * @returns {Array} Express validator chain
     */
    static updateValidation() {
        return [
            param('availabilityId')
                .notEmpty().withMessage('Availability ID is required'),
            body('period.startDate')
                .optional()
                .isISO8601().withMessage('Invalid date format'),
            body('period.endDate')
                .optional()
                .isISO8601().withMessage('Invalid date format'),
            body('availabilityStatus')
                .optional()
                .isIn(Object.values(AVAILABILITY_STATUS)).withMessage('Invalid availability status'),
            body('capacity.percentageAvailable')
                .optional()
                .isInt({ min: 0, max: 100 }).withMessage('Capacity percentage must be between 0 and 100')
        ];
    }

    /**
     * Validation rules for listing availability
     * @static
     * @returns {Array} Express validator chain
     */
    static listValidation() {
        return [
            param('consultantId')
                .notEmpty().withMessage('Consultant ID is required'),
            query('startDate')
                .optional()
                .isISO8601().withMessage('Invalid start date format'),
            query('endDate')
                .optional()
                .isISO8601().withMessage('Invalid end date format'),
            query('type')
                .optional()
                .isIn(Object.values(AVAILABILITY_TYPES)).withMessage('Invalid availability type'),
            query('status')
                .optional()
                .isIn(Object.values(AVAILABILITY_STATUS)).withMessage('Invalid status'),
            query('limit')
                .optional()
                .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
            query('skip')
                .optional()
                .isInt({ min: 0 }).withMessage('Skip must be a non-negative integer')
        ];
    }

    /**
     * Validation rules for finding available consultants
     * @static
     * @returns {Array} Express validator chain
     */
    static findAvailableValidation() {
        return [
            query('startDate')
                .notEmpty().withMessage('Start date is required')
                .isISO8601().withMessage('Invalid date format'),
            query('endDate')
                .notEmpty().withMessage('End date is required')
                .isISO8601().withMessage('Invalid date format'),
            query('minCapacity')
                .optional()
                .isInt({ min: 0, max: 100 }).withMessage('Min capacity must be between 0 and 100'),
            query('limit')
                .optional()
                .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
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
     * Create a new availability record
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Availability data
     * @param {Object} res - Express response object
     */
    async createAvailability(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const availability = await consultantAvailabilityService.createAvailability(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Availability created via API', {
                availabilityId: availability.availabilityRecordId,
                consultantId
            });

            this._sendSuccess(res, availability, 'Availability created successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Create a time-off request
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} req.body - Time-off request data
     * @param {Object} res - Express response object
     */
    async createTimeOffRequest(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const timeOff = await consultantAvailabilityService.createTimeOffRequest(consultantId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Time-off request created via API', {
                availabilityId: timeOff.availabilityRecordId,
                consultantId,
                reason: req.body.reason
            });

            this._sendSuccess(res, timeOff, 'Time-off request created successfully', 201);

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Bulk create availability records
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Array} req.body.availabilities - Array of availability data
     * @param {Object} res - Express response object
     */
    async bulkCreateAvailability(req, res) {
        try {
            const { consultantId } = req.params;
            const { availabilities } = req.body;

            if (!Array.isArray(availabilities) || availabilities.length === 0) {
                throw AppError.validation('Availabilities array is required');
            }

            const results = await consultantAvailabilityService.bulkCreateAvailability(consultantId, availabilities, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Bulk availability creation completed', {
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
     * Get availability record by ID
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.availabilityId - Availability record ID
     * @param {Object} res - Express response object
     */
    async getAvailabilityById(req, res) {
        try {
            const { availabilityId } = req.params;

            const availability = await consultantAvailabilityService.getAvailabilityById(availabilityId, {
                tenantId: this._getTenantId(req),
                includeConsultant: req.query.includeConsultant === 'true'
            });

            this._sendSuccess(res, availability, 'Availability retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get consultant's availability records
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async getConsultantAvailability(req, res) {
        try {
            this._validateRequest(req);

            const { consultantId } = req.params;

            const result = await consultantAvailabilityService.getConsultantAvailability(consultantId, {
                tenantId: this._getTenantId(req),
                startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
                type: req.query.type,
                status: req.query.status,
                approvalStatus: req.query.approvalStatus,
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            });

            this._sendSuccess(res, result, 'Availability retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get current user's availability (self-service)
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getMyAvailability(req, res) {
        try {
            // Get consultant by user ID first
            const consultantService = require('../services/consultant-service');
            const consultant = await consultantService.getConsultantByUserId(this._getUserId(req), {
                tenantId: this._getTenantId(req),
                skipTenantCheck: true
            });

            const result = await consultantAvailabilityService.getConsultantAvailability(consultant._id, {
                tenantId: this._getTenantId(req),
                skipTenantCheck: true,
                startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
                type: req.query.type,
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0
            });

            this._sendSuccess(res, result, 'Availability retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get availability for multiple consultants
     * @async
     * @param {Object} req - Express request object
     * @param {Array} req.body.consultantIds - Array of consultant IDs
     * @param {Object} res - Express response object
     */
    async getBulkConsultantAvailability(req, res) {
        try {
            const { consultantIds } = req.body;

            if (!Array.isArray(consultantIds) || consultantIds.length === 0) {
                throw AppError.validation('Consultant IDs array is required');
            }

            const result = await consultantAvailabilityService.getBulkConsultantAvailability(consultantIds, {
                tenantId: this._getTenantId(req),
                startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate) : undefined
            });

            this._sendSuccess(res, result, 'Bulk availability retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get pending time-off requests for approval
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getPendingTimeOffRequests(req, res) {
        try {
            const result = await consultantAvailabilityService.getPendingTimeOffRequests({
                tenantId: this._getTenantId(req),
                managerId: req.query.managerId,
                departmentId: req.query.departmentId,
                limit: parseInt(req.query.limit, 10) || 50,
                skip: parseInt(req.query.skip, 10) || 0
            });

            this._sendSuccess(res, result, 'Pending requests retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // UPDATE OPERATIONS
    // ============================================================================

    /**
     * Update availability record
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.availabilityId - Availability record ID
     * @param {Object} req.body - Update data
     * @param {Object} res - Express response object
     */
    async updateAvailability(req, res) {
        try {
            this._validateRequest(req);

            const { availabilityId } = req.params;

            const availability = await consultantAvailabilityService.updateAvailability(availabilityId, req.body, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req)
            });

            logger.info('Availability updated via API', { availabilityId });

            this._sendSuccess(res, availability, 'Availability updated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // TIME-OFF APPROVAL WORKFLOW
    // ============================================================================

    /**
     * Approve time-off request
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.availabilityId - Availability record ID
     * @param {Object} req.body - Approval data (comments)
     * @param {Object} res - Express response object
     */
    async approveTimeOff(req, res) {
        try {
            const { availabilityId } = req.params;

            const availability = await consultantAvailabilityService.approveTimeOff(availabilityId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                comments: req.body.comments
            });

            logger.info('Time-off approved via API', { availabilityId });

            this._sendSuccess(res, availability, 'Time-off approved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Reject time-off request
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.availabilityId - Availability record ID
     * @param {Object} req.body - Rejection data (reason)
     * @param {Object} res - Express response object
     */
    async rejectTimeOff(req, res) {
        try {
            const { availabilityId } = req.params;

            if (!req.body.reason) {
                throw AppError.validation('Rejection reason is required');
            }

            const availability = await consultantAvailabilityService.rejectTimeOff(availabilityId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                reason: req.body.reason
            });

            logger.info('Time-off rejected via API', { availabilityId });

            this._sendSuccess(res, availability, 'Time-off rejected');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Cancel time-off request
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.availabilityId - Availability record ID
     * @param {Object} req.body - Cancellation data (reason)
     * @param {Object} res - Express response object
     */
    async cancelTimeOff(req, res) {
        try {
            const { availabilityId } = req.params;

            const availability = await consultantAvailabilityService.cancelTimeOff(availabilityId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                reason: req.body.reason
            });

            logger.info('Time-off cancelled via API', { availabilityId });

            this._sendSuccess(res, availability, 'Time-off cancelled successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // DELETE OPERATIONS
    // ============================================================================

    /**
     * Delete availability record
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.availabilityId - Availability record ID
     * @param {Object} res - Express response object
     */
    async deleteAvailability(req, res) {
        try {
            const { availabilityId } = req.params;

            const result = await consultantAvailabilityService.deleteAvailability(availabilityId, {
                tenantId: this._getTenantId(req),
                userId: this._getUserId(req),
                hardDelete: req.query.hard === 'true'
            });

            this._sendSuccess(res, result, 'Availability deleted successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // CAPACITY & AVAILABILITY SEARCH
    // ============================================================================

    /**
     * Get consultant capacity for a date range
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async getConsultantCapacity(req, res) {
        try {
            const { consultantId } = req.params;

            if (!req.query.startDate || !req.query.endDate) {
                throw AppError.validation('Start date and end date are required');
            }

            const capacity = await consultantAvailabilityService.getConsultantCapacity(consultantId, {
                tenantId: this._getTenantId(req),
                startDate: new Date(req.query.startDate),
                endDate: new Date(req.query.endDate)
            });

            this._sendSuccess(res, capacity, 'Capacity retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Find available consultants for a date range
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async findAvailableConsultants(req, res) {
        try {
            this._validateRequest(req);

            const criteria = {
                startDate: new Date(req.query.startDate),
                endDate: new Date(req.query.endDate),
                minCapacity: parseInt(req.query.minCapacity, 10) || 0,
                skills: req.query.skills?.split(','),
                level: req.query.level,
                department: req.query.department
            };

            const results = await consultantAvailabilityService.findAvailableConsultants(criteria, {
                tenantId: this._getTenantId(req),
                limit: parseInt(req.query.limit, 10) || 50
            });

            this._sendSuccess(res, results, 'Available consultants found');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Check for conflicts with existing availability
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async checkConflicts(req, res) {
        try {
            const { consultantId } = req.params;

            if (!req.query.startDate || !req.query.endDate) {
                throw AppError.validation('Start date and end date are required');
            }

            const conflicts = await consultantAvailabilityService.checkConflicts(consultantId, {
                tenantId: this._getTenantId(req),
                startDate: new Date(req.query.startDate),
                endDate: new Date(req.query.endDate),
                excludeId: req.query.excludeId
            });

            this._sendSuccess(res, conflicts, 'Conflict check completed');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    // ============================================================================
    // REPORTS & ANALYTICS
    // ============================================================================

    /**
     * Get time-off balance for consultant
     * @async
     * @param {Object} req - Express request object
     * @param {string} req.params.consultantId - Consultant ID
     * @param {Object} res - Express response object
     */
    async getTimeOffBalance(req, res) {
        try {
            const { consultantId } = req.params;

            const balance = await consultantAvailabilityService.getTimeOffBalance(consultantId, {
                tenantId: this._getTenantId(req),
                year: parseInt(req.query.year, 10) || new Date().getFullYear()
            });

            this._sendSuccess(res, balance, 'Time-off balance retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get capacity report
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getCapacityReport(req, res) {
        try {
            const report = await consultantAvailabilityService.getCapacityReport({
                tenantId: this._getTenantId(req),
                startDate: req.query.startDate ? new Date(req.query.startDate) : new Date(),
                endDate: req.query.endDate ? new Date(req.query.endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                departmentId: req.query.departmentId,
                teamId: req.query.teamId
            });

            this._sendSuccess(res, report, 'Capacity report generated successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }

    /**
     * Get availability statistics
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getAvailabilityStatistics(req, res) {
        try {
            const stats = await consultantAvailabilityService.getAvailabilityStatistics({
                tenantId: this._getTenantId(req),
                consultantId: req.query.consultantId,
                startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
                endDate: req.query.endDate ? new Date(req.query.endDate) : undefined
            });

            this._sendSuccess(res, stats, 'Statistics retrieved successfully');

        } catch (error) {
            this._sendError(res, error);
        }
    }
}

// Export singleton instance and class
module.exports = new ConsultantAvailabilityController();
module.exports.ConsultantAvailabilityController = ConsultantAvailabilityController;