/**
 * @fileoverview Consultation Controller
 * @module servers/customer-services/modules/core-business/consultation-management/controllers/consultation-controller
 * @description HTTP request handlers for consultation management operations
 */

const { validationResult, body, param, query } = require('express-validator');
const consultationService = require('../services/consultation-service');
const {
    CONSULTATION_STATUS,
    CONSULTATION_TYPES,
    OUTCOME_STATUS
} = require('../services/consultation-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultation-controller'
});

/**
 * Consultation Controller
 * Handles HTTP requests for consultation management operations
 * @class ConsultationController
 */
class ConsultationController {
    constructor() {
        // Bind methods to preserve 'this' context
        this.createConsultation = this.createConsultation.bind(this);
        this.getConsultationById = this.getConsultationById.bind(this);
        this.getConsultationsByConsultant = this.getConsultationsByConsultant.bind(this);
        this.getMyConsultations = this.getMyConsultations.bind(this);
        this.getConsultationsByClient = this.getConsultationsByClient.bind(this);
        this.updateConsultation = this.updateConsultation.bind(this);
        this.startConsultation = this.startConsultation.bind(this);
        this.completeConsultation = this.completeConsultation.bind(this);
        this.cancelConsultation = this.cancelConsultation.bind(this);
        this.rescheduleConsultation = this.rescheduleConsultation.bind(this);
        this.addActionItem = this.addActionItem.bind(this);
        this.updateActionItem = this.updateActionItem.bind(this);
        this.addDeliverable = this.addDeliverable.bind(this);
        this.submitClientFeedback = this.submitClientFeedback.bind(this);
        this.submitConsultantFeedback = this.submitConsultantFeedback.bind(this);
        this.getConsultationMetrics = this.getConsultationMetrics.bind(this);
        this.getUpcomingConsultations = this.getUpcomingConsultations.bind(this);
        this.deleteConsultation = this.deleteConsultation.bind(this);
    }

    // ============================================================================
    // VALIDATION RULES
    // ============================================================================

    static createValidation() {
        return [
            body('consultantId').notEmpty().withMessage('Consultant ID is required'),
            body('clientId').notEmpty().withMessage('Client ID is required'),
            body('title').notEmpty().withMessage('Title is required')
                .isLength({ max: 200 }).withMessage('Title must be at most 200 characters'),
            body('type').notEmpty().withMessage('Type is required')
                .isIn(Object.values(CONSULTATION_TYPES)).withMessage('Invalid consultation type'),
            body('scheduledStart').notEmpty().withMessage('Start date/time is required')
                .isISO8601().withMessage('Invalid date format'),
            body('scheduledEnd').notEmpty().withMessage('End date/time is required')
                .isISO8601().withMessage('Invalid date format'),
            body('description').optional().isLength({ max: 5000 })
                .withMessage('Description must be at most 5000 characters')
        ];
    }

    static updateValidation() {
        return [
            param('consultationId').notEmpty().withMessage('Consultation ID is required')
        ];
    }

    static feedbackValidation() {
        return [
            param('consultationId').notEmpty().withMessage('Consultation ID is required'),
            body('rating').notEmpty().withMessage('Rating is required')
                .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
            body('feedback').optional().isLength({ max: 2000 })
                .withMessage('Feedback must be at most 2000 characters')
        ];
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    _getTenantId(req) {
        return req.tenantId || req.user?.tenantId || req.headers['x-tenant-id'];
    }

    _getUserId(req) {
        return req.user?.id || req.user?._id || req.userId;
    }

    _validateRequest(req) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw AppError.validation('Validation failed', {
                errors: errors.array().map(e => e.msg)
            });
        }
    }

    _sendSuccess(res, data, message = 'Success', statusCode = 200) {
        return res.status(statusCode).json({
            success: true,
            message,
            data
        });
    }

    // ============================================================================
    // ROUTE HANDLERS
    // ============================================================================

    /**
     * Create new consultation
     * POST /consultations
     */
    async createConsultation(req, res, next) {
        try {
            this._validateRequest(req);

            const consultationData = {
                consultantId: req.body.consultantId,
                clientId: req.body.clientId,
                title: req.body.title,
                description: req.body.description,
                type: req.body.type,
                category: req.body.category,
                priority: req.body.priority,
                scheduledStart: req.body.scheduledStart,
                scheduledEnd: req.body.scheduledEnd,
                timezone: req.body.timezone,
                assignmentId: req.body.assignmentId,
                projectId: req.body.projectId,
                objectives: req.body.objectives,
                agenda: req.body.agenda,
                attendees: req.body.attendees,
                location: req.body.location,
                billable: req.body.billable,
                rateType: req.body.rateType,
                rate: req.body.rate
            };

            const consultation = await consultationService.createConsultation(
                consultationData,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Consultation created successfully', 201);

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get consultation by ID
     * GET /consultations/:consultationId
     */
    async getConsultationById(req, res, next) {
        try {
            const { consultationId } = req.params;

            const consultation = await consultationService.getConsultationById(
                consultationId,
                { tenantId: this._getTenantId(req) }
            );

            this._sendSuccess(res, consultation);

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get consultations by consultant
     * GET /consultations/consultant/:consultantId
     */
    async getConsultationsByConsultant(req, res, next) {
        try {
            const { consultantId } = req.params;
            const filters = {
                status: req.query.status,
                type: req.query.type,
                upcoming: req.query.upcoming === 'true',
                past: req.query.past === 'true',
                startDate: req.query.startDate,
                endDate: req.query.endDate,
                page: req.query.page,
                limit: req.query.limit
            };

            const result = await consultationService.getConsultationsByConsultant(
                consultantId,
                filters,
                { tenantId: this._getTenantId(req) }
            );

            this._sendSuccess(res, result);

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get current user's consultations
     * GET /consultations/me
     */
    async getMyConsultations(req, res, next) {
        try {
            const consultantId = req.user.consultantId;

            if (!consultantId) {
                throw AppError.validation('User does not have a consultant profile');
            }

            const filters = {
                status: req.query.status,
                upcoming: req.query.upcoming === 'true',
                past: req.query.past === 'true',
                page: req.query.page,
                limit: req.query.limit
            };

            const result = await consultationService.getConsultationsByConsultant(
                consultantId,
                filters,
                { tenantId: this._getTenantId(req) }
            );

            this._sendSuccess(res, result);

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get consultations by client
     * GET /consultations/client/:clientId
     */
    async getConsultationsByClient(req, res, next) {
        try {
            const { clientId } = req.params;
            const filters = {
                status: req.query.status,
                upcoming: req.query.upcoming === 'true',
                page: req.query.page,
                limit: req.query.limit
            };

            const result = await consultationService.getConsultationsByClient(
                clientId,
                filters,
                { tenantId: this._getTenantId(req) }
            );

            this._sendSuccess(res, result);

        } catch (error) {
            next(error);
        }
    }

    /**
     * Update consultation
     * PUT /consultations/:consultationId
     */
    async updateConsultation(req, res, next) {
        try {
            this._validateRequest(req);

            const { consultationId } = req.params;
            const updateData = req.body;

            const consultation = await consultationService.updateConsultation(
                consultationId,
                updateData,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Consultation updated successfully');

        } catch (error) {
            next(error);
        }
    }

    /**
     * Start consultation
     * POST /consultations/:consultationId/start
     */
    async startConsultation(req, res, next) {
        try {
            const { consultationId } = req.params;

            const consultation = await consultationService.startConsultation(
                consultationId,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Consultation started successfully');

        } catch (error) {
            next(error);
        }
    }

    /**
     * Complete consultation
     * POST /consultations/:consultationId/complete
     */
    async completeConsultation(req, res, next) {
        try {
            const { consultationId } = req.params;
            const outcomeData = req.body;

            const consultation = await consultationService.completeConsultation(
                consultationId,
                outcomeData,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Consultation completed successfully');

        } catch (error) {
            next(error);
        }
    }

    /**
     * Cancel consultation
     * POST /consultations/:consultationId/cancel
     */
    async cancelConsultation(req, res, next) {
        try {
            const { consultationId } = req.params;
            const { reason } = req.body;

            const consultation = await consultationService.cancelConsultation(
                consultationId,
                reason,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Consultation cancelled successfully');

        } catch (error) {
            next(error);
        }
    }

    /**
     * Reschedule consultation
     * POST /consultations/:consultationId/reschedule
     */
    async rescheduleConsultation(req, res, next) {
        try {
            const { consultationId } = req.params;
            const { newStart, newEnd, reason } = req.body;

            const consultation = await consultationService.rescheduleConsultation(
                consultationId,
                new Date(newStart),
                new Date(newEnd),
                reason,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Consultation rescheduled successfully');

        } catch (error) {
            next(error);
        }
    }

    /**
     * Add action item
     * POST /consultations/:consultationId/action-items
     */
    async addActionItem(req, res, next) {
        try {
            const { consultationId } = req.params;
            const actionItemData = req.body;

            const consultation = await consultationService.addActionItem(
                consultationId,
                actionItemData,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Action item added successfully', 201);

        } catch (error) {
            next(error);
        }
    }

    /**
     * Update action item
     * PUT /consultations/:consultationId/action-items/:actionItemId
     */
    async updateActionItem(req, res, next) {
        try {
            const { consultationId, actionItemId } = req.params;
            const updateData = req.body;

            const consultation = await consultationService.updateActionItem(
                consultationId,
                actionItemId,
                updateData,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Action item updated successfully');

        } catch (error) {
            next(error);
        }
    }

    /**
     * Add deliverable
     * POST /consultations/:consultationId/deliverables
     */
    async addDeliverable(req, res, next) {
        try {
            const { consultationId } = req.params;
            const deliverableData = req.body;

            const consultation = await consultationService.addDeliverable(
                consultationId,
                deliverableData,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Deliverable added successfully', 201);

        } catch (error) {
            next(error);
        }
    }

    /**
     * Submit client feedback
     * POST /consultations/:consultationId/feedback/client
     */
    async submitClientFeedback(req, res, next) {
        try {
            this._validateRequest(req);

            const { consultationId } = req.params;
            const feedbackData = req.body;

            const consultation = await consultationService.submitClientFeedback(
                consultationId,
                feedbackData,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Feedback submitted successfully');

        } catch (error) {
            next(error);
        }
    }

    /**
     * Submit consultant feedback
     * POST /consultations/:consultationId/feedback/consultant
     */
    async submitConsultantFeedback(req, res, next) {
        try {
            const { consultationId } = req.params;
            const feedbackData = req.body;

            const consultation = await consultationService.submitConsultantFeedback(
                consultationId,
                feedbackData,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, consultation, 'Feedback submitted successfully');

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get consultation metrics
     * GET /consultations/metrics
     */
    async getConsultationMetrics(req, res, next) {
        try {
            const consultantId = req.query.consultantId;
            const filters = {
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };

            const metrics = await consultationService.getConsultationMetrics(
                consultantId,
                filters,
                { tenantId: this._getTenantId(req) }
            );

            this._sendSuccess(res, metrics);

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get upcoming consultations
     * GET /consultations/upcoming
     */
    async getUpcomingConsultations(req, res, next) {
        try {
            const consultantId = req.query.consultantId || req.user.consultantId;
            const days = parseInt(req.query.days, 10) || 7;

            if (!consultantId) {
                throw AppError.validation('Consultant ID is required');
            }

            const consultations = await consultationService.getUpcomingConsultations(
                consultantId,
                days,
                { tenantId: this._getTenantId(req) }
            );

            this._sendSuccess(res, consultations);

        } catch (error) {
            next(error);
        }
    }

    /**
     * Delete consultation
     * DELETE /consultations/:consultationId
     */
    async deleteConsultation(req, res, next) {
        try {
            const { consultationId } = req.params;

            await consultationService.deleteConsultation(
                consultationId,
                {
                    tenantId: this._getTenantId(req),
                    userId: this._getUserId(req)
                }
            );

            this._sendSuccess(res, null, 'Consultation deleted successfully');

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ConsultationController();
