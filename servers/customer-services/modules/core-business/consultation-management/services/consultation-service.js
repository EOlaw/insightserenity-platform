/**
 * @fileoverview Consultation Management Service
 * @module servers/customer-services/modules/core-business/consultation-management/services/consultation-service
 * @description Comprehensive service for managing individual consulting sessions and engagements
 * between consultants and clients, including scheduling, deliverables, outcomes, and feedback
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultation-service'
});
const crypto = require('crypto');
const mongoose = require('mongoose');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import related services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');

/**
 * Consultation Status Constants
 */
const CONSULTATION_STATUS = {
    SCHEDULED: 'scheduled',
    CONFIRMED: 'confirmed',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    POSTPONED: 'postponed',
    NO_SHOW: 'no_show',
    RESCHEDULED: 'rescheduled'
};

/**
 * Consultation Type Constants
 */
const CONSULTATION_TYPES = {
    STRATEGY_SESSION: 'strategy_session',
    TECHNICAL_CONSULTATION: 'technical_consultation',
    ADVISORY: 'advisory',
    TRAINING: 'training',
    WORKSHOP: 'workshop',
    REVIEW: 'review',
    STATUS_UPDATE: 'status_update',
    PLANNING: 'planning',
    IMPLEMENTATION: 'implementation',
    TROUBLESHOOTING: 'troubleshooting',
    ASSESSMENT: 'assessment',
    OTHER: 'other'
};

/**
 * Outcome Status Constants
 */
const OUTCOME_STATUS = {
    SUCCESSFUL: 'successful',
    PARTIALLY_SUCCESSFUL: 'partially_successful',
    UNSUCCESSFUL: 'unsuccessful',
    CANCELLED: 'cancelled',
    POSTPONED: 'postponed'
};

/**
 * Deliverable Status Constants
 */
const DELIVERABLE_STATUS = {
    NOT_STARTED: 'not_started',
    IN_PROGRESS: 'in_progress',
    REVIEW: 'review',
    COMPLETED: 'completed',
    DELIVERED: 'delivered',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

/**
 * Action Item Status Constants
 */
const ACTION_ITEM_STATUS = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    BLOCKED: 'blocked'
};

/**
 * Consultation Service
 * Manages all aspects of individual consulting sessions
 * @class ConsultationService
 */
class ConsultationService {
    constructor() {
        this._dbService = null;
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            defaultSessionDuration: parseInt(process.env.DEFAULT_SESSION_DURATION_MINUTES, 10) || 60,
            defaultTimezone: process.env.DEFAULT_TIMEZONE || 'UTC',
            defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
            sendConfirmationEmail: process.env.SEND_CONSULTATION_CONFIRMATION === 'true' || true,
            sendReminderEmail: process.env.SEND_CONSULTATION_REMINDER === 'true' || true,
            reminderBeforeMinutes: parseInt(process.env.CONSULTATION_REMINDER_MINUTES, 10) || 1440, // 24 hours
            allowRecording: process.env.ALLOW_SESSION_RECORDING === 'true' || false,
            requireRecordingConsent: process.env.REQUIRE_RECORDING_CONSENT === 'true' || true,
            maxAttendeesPerSession: parseInt(process.env.MAX_ATTENDEES_PER_SESSION, 10) || 20,
            cancellationWindowHours: parseInt(process.env.CANCELLATION_WINDOW_HOURS, 10) || 24
        };
    }

    /**
     * Get database service instance
     * @private
     * @returns {Object} Database service
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database.getDatabaseService();
        }
        return this._dbService;
    }

    // ============= CONSULTATION CREATION =============

    /**
     * Create a new consultation session
     * @param {Object} consultationData - Consultation information
     * @param {string} consultationData.consultantId - Consultant ID
     * @param {string} consultationData.clientId - Client ID
     * @param {string} consultationData.title - Session title
     * @param {string} consultationData.type - Consultation type
     * @param {Date} consultationData.scheduledStart - Start date/time
     * @param {Date} consultationData.scheduledEnd - End date/time
     * @param {Object} options - Additional options
     * @param {string} options.tenantId - Tenant ID for multi-tenancy
     * @param {string} options.userId - User ID of the creator
     * @returns {Promise<Object>} Created consultation record
     */
    async createConsultation(consultationData, options = {}) {
        try {
            logger.info('Creating consultation session', {
                consultantId: consultationData.consultantId,
                clientId: consultationData.clientId,
                type: consultationData.type
            });

            // Validate required fields
            this._validateRequiredFields(consultationData, [
                'consultantId',
                'clientId',
                'title',
                'type',
                'scheduledStart',
                'scheduledEnd'
            ]);

            const dbService = this._getDatabaseService();
            const Consultation = dbService.getModel('Consultation', 'customer');
            const Consultant = dbService.getModel('Consultant', 'customer');
            const Client = dbService.getModel('Client', 'customer');

            // Verify consultant exists and is active
            const consultant = await Consultant.findById(consultationData.consultantId);
            if (!consultant) {
                throw AppError.notFound('Consultant not found');
            }

            if (!consultant.status?.isActive || consultant.status?.isDeleted) {
                throw AppError.validation('Consultant is not active');
            }

            // Verify client exists
            const client = await Client.findById(consultationData.clientId);
            if (!client) {
                throw AppError.notFound('Client not found');
            }

            // Check for scheduling conflicts
            await this._checkSchedulingConflicts(
                consultationData.consultantId,
                consultationData.scheduledStart,
                consultationData.scheduledEnd
            );

            // Generate consultation ID
            const consultationId = await this._generateConsultationId(
                options.tenantId || consultant.tenantId
            );

            // Calculate duration
            const duration = this._calculateDuration(
                consultationData.scheduledStart,
                consultationData.scheduledEnd
            );

            // Create consultation object
            const consultationRecord = new Consultation({
                consultationId,
                tenantId: options.tenantId || consultant.tenantId,
                organizationId: consultant.organizationId,
                consultantId: consultationData.consultantId,
                clientId: consultationData.clientId,
                assignmentId: consultationData.assignmentId,
                projectId: consultationData.projectId,
                engagementId: consultationData.engagementId,

                details: {
                    title: consultationData.title,
                    description: consultationData.description,
                    type: consultationData.type,
                    category: consultationData.category,
                    priority: consultationData.priority || 'medium',
                    objectives: consultationData.objectives || [],
                    agenda: consultationData.agenda || [],
                    attendees: consultationData.attendees || [],
                    location: consultationData.location || {
                        type: 'remote',
                        timezone: this.config.defaultTimezone
                    }
                },

                schedule: {
                    scheduledStart: consultationData.scheduledStart,
                    scheduledEnd: consultationData.scheduledEnd,
                    duration: {
                        scheduled: duration
                    },
                    timezone: consultationData.timezone || this.config.defaultTimezone,
                    isRecurring: consultationData.isRecurring || false,
                    recurrence: consultationData.recurrence || null,
                    reminders: consultationData.reminders || []
                },

                billing: {
                    billable: consultationData.billable !== false,
                    rateType: consultationData.rateType || 'hourly',
                    rate: consultationData.rate || {
                        amount: 0,
                        currency: this.config.defaultCurrency
                    }
                },

                status: {
                    current: CONSULTATION_STATUS.SCHEDULED,
                    isActive: true,
                    isDeleted: false
                },

                metadata: {
                    source: consultationData.source || 'manual',
                    createdBy: options.userId,
                    tags: consultationData.tags || []
                }
            });

            // Save to database
            await consultationRecord.save();

            logger.info('Consultation created successfully', {
                consultationId: consultationRecord.consultationId,
                consultantId: consultationRecord.consultantId,
                clientId: consultationRecord.clientId
            });

            // Send confirmation notification
            if (this.config.sendConfirmationEmail) {
                await this._sendConfirmationNotification(consultationRecord);
            }

            // Schedule reminders
            if (this.config.sendReminderEmail) {
                await this._scheduleReminders(consultationRecord);
            }

            // Track analytics
            await this._trackConsultationCreated(consultationRecord);

            return consultationRecord;

        } catch (error) {
            logger.error('Error creating consultation', { error: error.message, stack: error.stack });
            throw error;
        }
    }

    /**
     * Get consultation by ID
     * @param {string} consultationId - Consultation ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Consultation record
     */
    async getConsultationById(consultationId, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Consultation = dbService.getModel('Consultation', 'customer');

            const query = {
                consultationId,
                'status.isDeleted': false
            };

            if (options.tenantId) {
                query.tenantId = options.tenantId;
            }

            const consultation = await Consultation.findOne(query)
                .populate('consultantId', 'profile.firstName profile.lastName consultantCode professional.level')
                .populate('clientId', 'companyName clientCode')
                .populate('assignmentId', 'assignmentId details.role')
                .populate('projectId', 'name projectCode');

            if (!consultation) {
                throw AppError.notFound('Consultation not found');
            }

            return consultation;

        } catch (error) {
            logger.error('Error getting consultation', { consultationId, error: error.message });
            throw error;
        }
    }

    /**
     * Get consultations by consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} filters - Filter options
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated consultation list
     */
    async getConsultationsByConsultant(consultantId, filters = {}, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Consultation = dbService.getModel('Consultation', 'customer');

            const query = {
                consultantId,
                'status.isDeleted': false
            };

            if (options.tenantId) {
                query.tenantId = options.tenantId;
            }

            // Apply filters
            if (filters.status) {
                query['status.current'] = filters.status;
            }

            if (filters.type) {
                query['details.type'] = filters.type;
            }

            if (filters.upcoming) {
                query['schedule.scheduledStart'] = { $gte: new Date() };
                query['status.current'] = { $in: [CONSULTATION_STATUS.SCHEDULED, CONSULTATION_STATUS.CONFIRMED] };
            }

            if (filters.past) {
                query['schedule.scheduledEnd'] = { $lt: new Date() };
            }

            if (filters.startDate || filters.endDate) {
                query['schedule.scheduledStart'] = {};
                if (filters.startDate) {
                    query['schedule.scheduledStart'].$gte = new Date(filters.startDate);
                }
                if (filters.endDate) {
                    query['schedule.scheduledStart'].$lte = new Date(filters.endDate);
                }
            }

            const page = parseInt(filters.page, 10) || 1;
            const limit = parseInt(filters.limit, 10) || 50;
            const skip = (page - 1) * limit;

            const [consultations, total] = await Promise.all([
                Consultation.find(query)
                    .populate('clientId', 'companyName clientCode')
                    .populate('assignmentId', 'assignmentId details.role')
                    .sort({ 'schedule.scheduledStart': -1 })
                    .skip(skip)
                    .limit(limit),
                Consultation.countDocuments(query)
            ]);

            return {
                data: consultations,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                    hasMore: total > (page * limit)
                }
            };

        } catch (error) {
            logger.error('Error getting consultations by consultant', { consultantId, error: error.message });
            throw error;
        }
    }

    /**
     * Get consultations by client
     * @param {string} clientId - Client ID
     * @param {Object} filters - Filter options
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated consultation list
     */
    async getConsultationsByClient(clientId, filters = {}, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Consultation = dbService.getModel('Consultation', 'customer');

            const query = {
                clientId,
                'status.isDeleted': false
            };

            if (options.tenantId) {
                query.tenantId = options.tenantId;
            }

            // Apply filters
            if (filters.status) {
                query['status.current'] = filters.status;
            }

            if (filters.upcoming) {
                query['schedule.scheduledStart'] = { $gte: new Date() };
                query['status.current'] = { $in: [CONSULTATION_STATUS.SCHEDULED, CONSULTATION_STATUS.CONFIRMED] };
            }

            const page = parseInt(filters.page, 10) || 1;
            const limit = parseInt(filters.limit, 10) || 50;
            const skip = (page - 1) * limit;

            const [consultations, total] = await Promise.all([
                Consultation.find(query)
                    .populate('consultantId', 'profile.firstName profile.lastName consultantCode professional.level')
                    .populate('assignmentId', 'assignmentId details.role')
                    .sort({ 'schedule.scheduledStart': -1 })
                    .skip(skip)
                    .limit(limit),
                Consultation.countDocuments(query)
            ]);

            return {
                data: consultations,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                    hasMore: total > (page * limit)
                }
            };

        } catch (error) {
            logger.error('Error getting consultations by client', { clientId, error: error.message });
            throw error;
        }
    }

    /**
     * Update consultation
     * @param {string} consultationId - Consultation ID
     * @param {Object} updateData - Data to update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated consultation
     */
    async updateConsultation(consultationId, updateData, options = {}) {
        try {
            logger.info('Updating consultation', { consultationId });

            const consultation = await this.getConsultationById(consultationId, options);

            // Validate that consultation can be updated
            if (consultation.status.current === CONSULTATION_STATUS.COMPLETED) {
                throw AppError.validation('Cannot update completed consultation');
            }

            // Update allowed fields
            const allowedUpdates = [
                'details',
                'schedule',
                'billing',
                'preparation',
                'content',
                'outcomes',
                'deliverables'
            ];

            allowedUpdates.forEach(field => {
                if (updateData[field]) {
                    if (typeof updateData[field] === 'object' && !Array.isArray(updateData[field])) {
                        consultation[field] = { ...consultation[field], ...updateData[field] };
                    } else {
                        consultation[field] = updateData[field];
                    }
                }
            });

            // Update metadata
            consultation.metadata.updatedBy = options.userId;

            await consultation.save();

            logger.info('Consultation updated successfully', { consultationId });

            return consultation;

        } catch (error) {
            logger.error('Error updating consultation', { consultationId, error: error.message });
            throw error;
        }
    }

    /**
     * Start consultation session
     * @param {string} consultationId - Consultation ID
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated consultation
     */
    async startConsultation(consultationId, options = {}) {
        try {
            logger.info('Starting consultation', { consultationId });

            const consultation = await this.getConsultationById(consultationId, options);

            if (consultation.status.current !== CONSULTATION_STATUS.SCHEDULED &&
                consultation.status.current !== CONSULTATION_STATUS.CONFIRMED) {
                throw AppError.validation('Consultation must be scheduled or confirmed to start');
            }

            await consultation.start(options.userId);

            logger.info('Consultation started', { consultationId });

            return consultation;

        } catch (error) {
            logger.error('Error starting consultation', { consultationId, error: error.message });
            throw error;
        }
    }

    /**
     * Complete consultation session
     * @param {string} consultationId - Consultation ID
     * @param {Object} outcomeData - Outcome information
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated consultation
     */
    async completeConsultation(consultationId, outcomeData = {}, options = {}) {
        try {
            logger.info('Completing consultation', { consultationId });

            const consultation = await this.getConsultationById(consultationId, options);

            if (consultation.status.current !== CONSULTATION_STATUS.IN_PROGRESS &&
                consultation.status.current !== CONSULTATION_STATUS.SCHEDULED &&
                consultation.status.current !== CONSULTATION_STATUS.CONFIRMED) {
                throw AppError.validation('Only in-progress, scheduled, or confirmed consultations can be completed');
            }

            await consultation.complete(options.userId, outcomeData);

            logger.info('Consultation completed', { consultationId });

            // Send follow-up notification
            await this._sendFollowUpNotification(consultation);

            // Request feedback
            await this._requestFeedback(consultation);

            // Track analytics
            await this._trackConsultationCompleted(consultation);

            return consultation;

        } catch (error) {
            logger.error('Error completing consultation', { consultationId, error: error.message });
            throw error;
        }
    }

    /**
     * Cancel consultation
     * @param {string} consultationId - Consultation ID
     * @param {string} reason - Cancellation reason
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated consultation
     */
    async cancelConsultation(consultationId, reason, options = {}) {
        try {
            logger.info('Cancelling consultation', { consultationId, reason });

            const consultation = await this.getConsultationById(consultationId, options);

            if (consultation.status.current === CONSULTATION_STATUS.COMPLETED ||
                consultation.status.current === CONSULTATION_STATUS.CANCELLED) {
                throw AppError.validation('Cannot cancel completed or already cancelled consultation');
            }

            // Check cancellation window
            const hoursUntilStart = (consultation.schedule.scheduledStart - new Date()) / (1000 * 60 * 60);
            if (hoursUntilStart < this.config.cancellationWindowHours && hoursUntilStart > 0) {
                logger.warn('Consultation cancelled within cancellation window', {
                    consultationId,
                    hoursUntilStart
                });
            }

            await consultation.cancel(options.userId, reason);

            logger.info('Consultation cancelled', { consultationId });

            // Send cancellation notification
            await this._sendCancellationNotification(consultation, reason);

            // Track analytics
            await this._trackConsultationCancelled(consultation, reason);

            return consultation;

        } catch (error) {
            logger.error('Error cancelling consultation', { consultationId, error: error.message });
            throw error;
        }
    }

    /**
     * Reschedule consultation
     * @param {string} consultationId - Consultation ID
     * @param {Date} newStart - New start date/time
     * @param {Date} newEnd - New end date/time
     * @param {string} reason - Reschedule reason
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated consultation
     */
    async rescheduleConsultation(consultationId, newStart, newEnd, reason, options = {}) {
        try {
            logger.info('Rescheduling consultation', { consultationId, newStart, newEnd });

            const consultation = await this.getConsultationById(consultationId, options);

            if (consultation.status.current === CONSULTATION_STATUS.COMPLETED ||
                consultation.status.current === CONSULTATION_STATUS.CANCELLED) {
                throw AppError.validation('Cannot reschedule completed or cancelled consultation');
            }

            // Check for conflicts with new schedule
            await this._checkSchedulingConflicts(
                consultation.consultantId,
                newStart,
                newEnd,
                consultationId
            );

            await consultation.reschedule(newStart, newEnd, reason, options.userId);

            logger.info('Consultation rescheduled', { consultationId });

            // Send reschedule notification
            await this._sendRescheduleNotification(consultation);

            // Update reminders
            if (this.config.sendReminderEmail) {
                await this._scheduleReminders(consultation);
            }

            return consultation;

        } catch (error) {
            logger.error('Error rescheduling consultation', { consultationId, error: error.message });
            throw error;
        }
    }

    /**
     * Add action item to consultation
     * @param {string} consultationId - Consultation ID
     * @param {Object} actionItemData - Action item data
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated consultation
     */
    async addActionItem(consultationId, actionItemData, options = {}) {
        try {
            const consultation = await this.getConsultationById(consultationId, options);

            await consultation.addActionItem(actionItemData, options.userId);

            logger.info('Action item added to consultation', { consultationId });

            // Send notification to assignee
            if (actionItemData.assignedTo?.userId) {
                await this._sendActionItemNotification(consultation, actionItemData);
            }

            return consultation;

        } catch (error) {
            logger.error('Error adding action item', { consultationId, error: error.message });
            throw error;
        }
    }

    /**
     * Update action item
     * @param {string} consultationId - Consultation ID
     * @param {string} actionItemId - Action item ID
     * @param {Object} updateData - Update data
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated consultation
     */
    async updateActionItem(consultationId, actionItemId, updateData, options = {}) {
        try {
            const consultation = await this.getConsultationById(consultationId, options);

            await consultation.updateActionItem(actionItemId, updateData, options.userId);

            logger.info('Action item updated', { consultationId, actionItemId });

            return consultation;

        } catch (error) {
            logger.error('Error updating action item', { consultationId, actionItemId, error: error.message });
            throw error;
        }
    }

    /**
     * Add deliverable to consultation
     * @param {string} consultationId - Consultation ID
     * @param {Object} deliverableData - Deliverable data
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated consultation
     */
    async addDeliverable(consultationId, deliverableData, options = {}) {
        try {
            const consultation = await this.getConsultationById(consultationId, options);

            await consultation.addDeliverable(deliverableData, options.userId);

            logger.info('Deliverable added to consultation', { consultationId });

            return consultation;

        } catch (error) {
            logger.error('Error adding deliverable', { consultationId, error: error.message });
            throw error;
        }
    }

    /**
     * Submit client feedback
     * @param {string} consultationId - Consultation ID
     * @param {Object} feedbackData - Feedback data
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated consultation
     */
    async submitClientFeedback(consultationId, feedbackData, options = {}) {
        try {
            const consultation = await this.getConsultationById(consultationId, options);

            if (consultation.status.current !== CONSULTATION_STATUS.COMPLETED) {
                throw AppError.validation('Can only submit feedback for completed consultations');
            }

            await consultation.submitClientFeedback(feedbackData, options.userId);

            logger.info('Client feedback submitted', { consultationId, rating: feedbackData.rating });

            // Track analytics
            await this._trackFeedbackSubmitted(consultation, 'client', feedbackData.rating);

            return consultation;

        } catch (error) {
            logger.error('Error submitting client feedback', { consultationId, error: error.message });
            throw error;
        }
    }

    /**
     * Submit consultant feedback
     * @param {string} consultationId - Consultation ID
     * @param {Object} feedbackData - Feedback data
     * @param {Object} options - Options
     * @returns {Promise<Object>} Updated consultation
     */
    async submitConsultantFeedback(consultationId, feedbackData, options = {}) {
        try {
            const consultation = await this.getConsultationById(consultationId, options);

            if (consultation.status.current !== CONSULTATION_STATUS.COMPLETED) {
                throw AppError.validation('Can only submit feedback for completed consultations');
            }

            await consultation.submitConsultantFeedback(feedbackData, options.userId);

            logger.info('Consultant feedback submitted', { consultationId });

            return consultation;

        } catch (error) {
            logger.error('Error submitting consultant feedback', { consultationId, error: error.message });
            throw error;
        }
    }

    /**
     * Get consultation metrics
     * @param {string} consultantId - Consultant ID (optional)
     * @param {Object} filters - Date range and filters
     * @param {Object} options - Options
     * @returns {Promise<Object>} Consultation metrics
     */
    async getConsultationMetrics(consultantId, filters = {}, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Consultation = dbService.getModel('Consultation', 'customer');

            const startDate = filters.startDate ? new Date(filters.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

            const metrics = await Consultation.getConsultationMetrics(
                options.tenantId || this.config.companyTenantId,
                consultantId,
                startDate,
                endDate
            );

            return metrics;

        } catch (error) {
            logger.error('Error getting consultation metrics', { consultantId, error: error.message });
            throw error;
        }
    }

    /**
     * Get upcoming consultations
     * @param {string} consultantId - Consultant ID
     * @param {number} days - Number of days ahead
     * @param {Object} options - Options
     * @returns {Promise<Array>} Upcoming consultations
     */
    async getUpcomingConsultations(consultantId, days = 7, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const Consultation = dbService.getModel('Consultation', 'customer');

            const consultations = await Consultation.getUpcoming(
                options.tenantId || this.config.companyTenantId,
                consultantId,
                days
            );

            return consultations;

        } catch (error) {
            logger.error('Error getting upcoming consultations', { consultantId, error: error.message });
            throw error;
        }
    }

    /**
     * Delete consultation (soft delete)
     * @param {string} consultationId - Consultation ID
     * @param {Object} options - Options
     * @returns {Promise<boolean>} Success status
     */
    async deleteConsultation(consultationId, options = {}) {
        try {
            logger.info('Deleting consultation', { consultationId });

            const consultation = await this.getConsultationById(consultationId, options);

            if (consultation.status.current === CONSULTATION_STATUS.IN_PROGRESS) {
                throw AppError.validation('Cannot delete consultation that is in progress');
            }

            consultation.status.isDeleted = true;
            consultation.status.deletedAt = new Date();
            consultation.status.deletedBy = options.userId;
            consultation.metadata.updatedBy = options.userId;

            await consultation.save();

            logger.info('Consultation deleted', { consultationId });

            return true;

        } catch (error) {
            logger.error('Error deleting consultation', { consultationId, error: error.message });
            throw error;
        }
    }

    // ============= PRIVATE HELPER METHODS =============

    /**
     * Validate required fields
     * @private
     */
    _validateRequiredFields(data, requiredFields) {
        const missing = requiredFields.filter(field => !data[field]);
        if (missing.length > 0) {
            throw AppError.validation(`Missing required fields: ${missing.join(', ')}`);
        }
    }

    /**
     * Check for scheduling conflicts
     * @private
     */
    async _checkSchedulingConflicts(consultantId, startDate, endDate, excludeConsultationId = null) {
        const dbService = this._getDatabaseService();
        const Consultation = dbService.getModel('Consultation', 'customer');

        const query = {
            consultantId,
            'status.current': {
                $in: [CONSULTATION_STATUS.SCHEDULED, CONSULTATION_STATUS.CONFIRMED, CONSULTATION_STATUS.IN_PROGRESS]
            },
            'status.isDeleted': false,
            $or: [
                {
                    'schedule.scheduledStart': { $lte: endDate },
                    'schedule.scheduledEnd': { $gte: startDate }
                }
            ]
        };

        if (excludeConsultationId) {
            query.consultationId = { $ne: excludeConsultationId };
        }

        const conflicts = await Consultation.find(query);

        if (conflicts.length > 0) {
            throw AppError.validation('Consultant has conflicting consultation scheduled', {
                context: { conflicts: conflicts.length }
            });
        }
    }

    /**
     * Generate consultation ID
     * @private
     */
    async _generateConsultationId(tenantId) {
        const dbService = this._getDatabaseService();
        const Consultation = dbService.getModel('Consultation', 'customer');

        return await Consultation.generateConsultationId(tenantId);
    }

    /**
     * Calculate duration in minutes
     * @private
     */
    _calculateDuration(startDate, endDate) {
        return Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60));
    }

    /**
     * Send confirmation notification
     * @private
     */
    async _sendConfirmationNotification(consultation) {
        try {
            // Implementation depends on your notification service
            logger.info('Sending consultation confirmation', {
                consultationId: consultation.consultationId
            });
        } catch (error) {
            logger.error('Error sending confirmation notification', { error: error.message });
        }
    }

    /**
     * Schedule reminders
     * @private
     */
    async _scheduleReminders(consultation) {
        try {
            // Implementation depends on your scheduling system
            logger.info('Scheduling consultation reminders', {
                consultationId: consultation.consultationId
            });
        } catch (error) {
            logger.error('Error scheduling reminders', { error: error.message });
        }
    }

    /**
     * Send follow-up notification
     * @private
     */
    async _sendFollowUpNotification(consultation) {
        try {
            logger.info('Sending follow-up notification', {
                consultationId: consultation.consultationId
            });
        } catch (error) {
            logger.error('Error sending follow-up notification', { error: error.message });
        }
    }

    /**
     * Request feedback
     * @private
     */
    async _requestFeedback(consultation) {
        try {
            logger.info('Requesting feedback', {
                consultationId: consultation.consultationId
            });
        } catch (error) {
            logger.error('Error requesting feedback', { error: error.message });
        }
    }

    /**
     * Send cancellation notification
     * @private
     */
    async _sendCancellationNotification(consultation, reason) {
        try {
            logger.info('Sending cancellation notification', {
                consultationId: consultation.consultationId,
                reason
            });
        } catch (error) {
            logger.error('Error sending cancellation notification', { error: error.message });
        }
    }

    /**
     * Send reschedule notification
     * @private
     */
    async _sendRescheduleNotification(consultation) {
        try {
            logger.info('Sending reschedule notification', {
                consultationId: consultation.consultationId
            });
        } catch (error) {
            logger.error('Error sending reschedule notification', { error: error.message });
        }
    }

    /**
     * Send action item notification
     * @private
     */
    async _sendActionItemNotification(consultation, actionItem) {
        try {
            logger.info('Sending action item notification', {
                consultationId: consultation.consultationId,
                assignedTo: actionItem.assignedTo
            });
        } catch (error) {
            logger.error('Error sending action item notification', { error: error.message });
        }
    }

    /**
     * Track consultation created analytics
     * @private
     */
    async _trackConsultationCreated(consultation) {
        try {
            // Track analytics event
        } catch (error) {
            logger.error('Error tracking consultation created', { error: error.message });
        }
    }

    /**
     * Track consultation completed analytics
     * @private
     */
    async _trackConsultationCompleted(consultation) {
        try {
            // Track analytics event
        } catch (error) {
            logger.error('Error tracking consultation completed', { error: error.message });
        }
    }

    /**
     * Track consultation cancelled analytics
     * @private
     */
    async _trackConsultationCancelled(consultation, reason) {
        try {
            // Track analytics event
        } catch (error) {
            logger.error('Error tracking consultation cancelled', { error: error.message });
        }
    }

    /**
     * Track feedback submitted analytics
     * @private
     */
    async _trackFeedbackSubmitted(consultation, feedbackType, rating) {
        try {
            // Track analytics event
        } catch (error) {
            logger.error('Error tracking feedback submitted', { error: error.message });
        }
    }
}

// Export singleton instance
module.exports = new ConsultationService();

// Export constants for use in other modules
module.exports.CONSULTATION_STATUS = CONSULTATION_STATUS;
module.exports.CONSULTATION_TYPES = CONSULTATION_TYPES;
module.exports.OUTCOME_STATUS = OUTCOME_STATUS;
module.exports.DELIVERABLE_STATUS = DELIVERABLE_STATUS;
module.exports.ACTION_ITEM_STATUS = ACTION_ITEM_STATUS;
