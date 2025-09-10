'use strict';

/**
 * @fileoverview Comprehensive consultant availability controller for calendar management, booking operations, and capacity planning
 * @module servers/customer-services/modules/core-business/consultants/controllers/consultant-availability-controller
 */

const ConsultantAvailabilityService = require('../services/consultant-availability-service');
const CalendarService = require('../../../../../../shared/lib/services/calendar-service');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const { ResponseFormatter } = require('../../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const PaginationHelper = require('../../../../../../shared/lib/utils/helpers/pagination-helper');
const { STATUS_CODES } = require('../../../../../../shared/lib/utils/constants/status-codes');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const moment = require('moment-timezone');
const validator = require('validator');

/**
 * Controller class for consultant availability management operations
 * @class ConsultantAvailabilityController
 */
class ConsultantAvailabilityController {
    /**
     * Private fields
     */
    #availabilityService;
    #calendarService;
    #responseFormatter;
    #validationConfig;
    #securityConfig;
    #cacheConfig;
    #bulkConfig;
    #bookingConfig;
    #scheduleConfig;
    #capacityConfig;
    #searchConfig;
    #paginationConfig;
    #rateLimitConfig;
    #auditConfig;
    #conflictConfig;

    /**
     * Constructor
     */
    constructor() {
        this.#availabilityService = new ConsultantAvailabilityService();
        this.#calendarService = new CalendarService();
        this.#responseFormatter = new ResponseFormatter();
        this.#initializeConfigurations();

        // Bind all methods to preserve context
        this.initializeAvailability = this.initializeAvailability.bind(this);
        this.getConsultantAvailability = this.getConsultantAvailability.bind(this);
        this.updateAvailabilitySchedule = this.updateAvailabilitySchedule.bind(this);
        this.deleteAvailability = this.deleteAvailability.bind(this);
        this.createBooking = this.createBooking.bind(this);
        this.updateBooking = this.updateBooking.bind(this);
        this.cancelBooking = this.cancelBooking.bind(this);
        this.getBookings = this.getBookings.bind(this);
        this.searchAvailableConsultants = this.searchAvailableConsultants.bind(this);
        this.calculateCapacity = this.calculateCapacity.bind(this);
        this.optimizeUtilization = this.optimizeUtilization.bind(this);
        this.detectConflicts = this.detectConflicts.bind(this);
        this.resolveConflict = this.resolveConflict.bind(this);
        this.generateUtilizationReport = this.generateUtilizationReport.bind(this);
        this.forecastAvailability = this.forecastAvailability.bind(this);
        this.bulkUpdateAvailability = this.bulkUpdateAvailability.bind(this);
        this.bulkCreateBookings = this.bulkCreateBookings.bind(this);
        this.exportAvailabilityReport = this.exportAvailabilityReport.bind(this);
        this.importAvailabilityData = this.importAvailabilityData.bind(this);
        this.getAvailabilityStatistics = this.getAvailabilityStatistics.bind(this);
        this.syncCalendarData = this.syncCalendarData.bind(this);
        this.validateAvailabilityData = this.validateAvailabilityData.bind(this);
        this.getAvailabilityDashboard = this.getAvailabilityDashboard.bind(this);
        this.updateWorkingHours = this.updateWorkingHours.bind(this);
        this.addTimeOff = this.addTimeOff.bind(this);
        this.removeTimeOff = this.removeTimeOff.bind(this);
        this.addRecurringCommitment = this.addRecurringCommitment.bind(this);
        this.removeRecurringCommitment = this.removeRecurringCommitment.bind(this);
        this.getCapacityPlanning = this.getCapacityPlanning.bind(this);
        this.getUtilizationTrends = this.getUtilizationTrends.bind(this);
        this.generateOptimizationRecommendations = this.generateOptimizationRecommendations.bind(this);
        this.validateTimeSlot = this.validateTimeSlot.bind(this);
        this.checkAvailabilityConflicts = this.checkAvailabilityConflicts.bind(this);

        logger.info('ConsultantAvailabilityController initialized');
    }

    /**
     * Initialize consultant availability
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async initializeAvailability(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Initializing consultant availability - Controller');

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.create');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.write');

            // Validate availability data
            await this.#validateAvailabilityInitData(req.body);

            // Prepare availability data
            const availabilityData = {
                ...req.body,
                workingHours: this.#normalizeWorkingHours(req.body.workingHours),
                capacity: this.#validateCapacityData(req.body.capacity),
                timeZone: req.body.timeZone || 'UTC'
            };

            // Initialization options
            const options = {
                syncExternalCalendar: req.body.syncExternalCalendar === true,
                skipNotifications: req.body.skipNotifications === true,
                createCalendar: req.body.createCalendar !== false
            };

            // Initialize availability
            const availability = await this.#availabilityService.initializeAvailability(
                consultantId,
                availabilityData,
                userId,
                options
            );

            // Log audit trail
            await this.#logControllerAction('AVAILABILITY_INITIALIZED', {
                consultantId,
                availabilityId: availability.availabilityId,
                userId
            });

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendAvailabilityNotification('initialized', availability, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatAvailabilityResponse(availability),
                'Availability initialized successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Get consultant availability
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getConsultantAvailability(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            logger.info(`Fetching availability for consultant: ${consultantId}`);

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.read');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.read');

            // Parse date range
            const dateRange = this.#parseDateRange(req.query);

            // Parse options from query
            const options = {
                includeBookings: req.query.includeBookings !== 'false',
                includeConflicts: req.query.includeConflicts === 'true',
                includeUtilization: req.query.includeUtilization === 'true',
                format: req.query.format || 'detailed',
                timeZone: req.query.timeZone
            };

            // Get availability
            const availability = await this.#availabilityService.getAvailability(
                consultantId,
                dateRange,
                options
            );

            if (!availability) {
                throw new NotFoundError('Availability not found', 'AVAILABILITY_NOT_FOUND');
            }

            // Add calendar integration data if requested
            if (req.query.includeCalendar === 'true') {
                availability.calendarIntegration = await this.#getCalendarIntegrationData(consultantId);
            }

            // Log access
            await this.#logControllerAction('AVAILABILITY_ACCESSED', {
                consultantId,
                userId: req.user?.id,
                dateRange
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatAvailabilityResponse(availability),
                'Availability retrieved successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.availabilityTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Update availability schedule
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updateAvailabilitySchedule(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating availability schedule for consultant: ${consultantId}`);

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.update');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.write');

            // Validate schedule update data
            await this.#validateScheduleUpdate(req.body);

            // Prepare schedule update
            const scheduleUpdate = {
                ...req.body,
                type: req.body.type || 'working_hours',
                effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : new Date()
            };

            // Update options
            const options = {
                forceUpdate: req.body.forceUpdate === true,
                skipNotifications: req.body.skipNotifications === true,
                reason: req.body.reason
            };

            // Update schedule
            const updatedAvailability = await this.#availabilityService.updateSchedule(
                consultantId,
                scheduleUpdate,
                userId,
                options
            );

            // Log audit trail
            await this.#logControllerAction('SCHEDULE_UPDATED', {
                consultantId,
                updateType: scheduleUpdate.type,
                userId
            });

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendAvailabilityNotification('schedule_updated', updatedAvailability, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatAvailabilityResponse(updatedAvailability),
                'Schedule updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Create booking
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async createBooking(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Creating booking for consultant: ${consultantId}`);

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.book');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.book');

            // Validate booking data
            await this.#validateBookingData(req.body);

            // Prepare booking data
            const bookingData = {
                ...req.body,
                period: {
                    start: new Date(req.body.period.start),
                    end: new Date(req.body.period.end)
                },
                allocation: this.#validateAllocationData(req.body.allocation),
                priority: req.body.priority || 'medium'
            };

            // Validate time slot availability
            await this.#validateTimeSlotAvailability(consultantId, bookingData.period);

            // Booking options
            const options = {
                tentative: req.body.tentative === true,
                overrideConflicts: req.body.overrideConflicts === true,
                skipNotifications: req.body.skipNotifications === true,
                autoConfirm: req.body.autoConfirm !== false
            };

            // Create booking
            const booking = await this.#availabilityService.createBooking(
                consultantId,
                bookingData,
                userId,
                options
            );

            // Log audit trail
            await this.#logControllerAction('BOOKING_CREATED', {
                consultantId,
                bookingId: booking.allocationId,
                projectId: booking.projectId,
                period: booking.period,
                userId
            });

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendBookingNotification('created', booking, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatBookingResponse(booking),
                'Booking created successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Update booking
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updateBooking(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId, bookingId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating booking: ${bookingId} for consultant: ${consultantId}`);

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.update_booking');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.book');

            // Validate booking update data
            await this.#validateBookingUpdateData(req.body);

            // Prepare update data
            const updateData = {
                ...req.body
            };

            // If period is being updated, validate the new time slot
            if (updateData.period) {
                updateData.period = {
                    start: new Date(updateData.period.start),
                    end: new Date(updateData.period.end)
                };
                await this.#validateTimeSlotAvailability(consultantId, updateData.period, bookingId);
            }

            // Update options
            const options = {
                forceUpdate: req.body.forceUpdate === true,
                skipNotifications: req.body.skipNotifications === true,
                reason: req.body.reason
            };

            // Update booking
            const updatedBooking = await this.#availabilityService.updateBooking(
                consultantId,
                bookingId,
                updateData,
                userId,
                options
            );

            // Log audit trail
            await this.#logControllerAction('BOOKING_UPDATED', {
                consultantId,
                bookingId,
                updatedFields: Object.keys(updateData),
                userId
            });

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendBookingNotification('updated', updatedBooking, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatBookingResponse(updatedBooking),
                'Booking updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Cancel booking
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async cancelBooking(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId, bookingId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Cancelling booking: ${bookingId} for consultant: ${consultantId}`);

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.cancel_booking');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.book');

            // Validate cancellation data
            const cancellationData = {
                reason: req.body.reason || 'User cancelled',
                refundPolicy: req.body.refundPolicy,
                notifyStakeholders: req.body.notifyStakeholders !== false
            };

            if (!cancellationData.reason) {
                throw new ValidationError('Cancellation reason is required', 'REASON_REQUIRED');
            }

            // Cancellation options
            const options = {
                moveToHistory: req.body.moveToHistory !== false,
                skipNotifications: req.body.skipNotifications === true
            };

            // Cancel booking
            const result = await this.#availabilityService.cancelBooking(
                consultantId,
                bookingId,
                cancellationData,
                userId,
                options
            );

            // Log audit trail
            await this.#logControllerAction('BOOKING_CANCELLED', {
                consultantId,
                bookingId,
                reason: cancellationData.reason,
                userId
            });

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendBookingNotification('cancelled', { bookingId, reason: cancellationData.reason }, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                { cancelled: true, reason: cancellationData.reason },
                'Booking cancelled successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Search available consultants
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async searchAvailableConsultants(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Searching available consultants');

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.search');

            // Validate search requirements
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Parse search requirements
            const requirements = this.#parseAvailabilityRequirements(req.query);

            // Parse options
            const options = {
                limit: Math.min(parseInt(req.query.limit) || 20, this.#paginationConfig.maxLimit),
                includePartialMatches: req.query.includePartialMatches === 'true',
                sortBy: req.query.sortBy || 'availability',
                tenantId: req.tenant?.id
            };

            // Search available consultants
            const availableConsultants = await this.#availabilityService.findAvailableConsultants(
                requirements,
                options
            );

            // Log search
            await this.#logControllerAction('AVAILABLE_CONSULTANTS_SEARCHED', {
                requirements,
                resultCount: availableConsultants.length,
                userId: req.user?.id
            });

            // Format response
            const formattedConsultants = availableConsultants.map(consultant => 
                this.#formatAvailableConsultantResponse(consultant)
            );

            const response = this.#responseFormatter.formatSuccess(
                formattedConsultants,
                'Available consultants retrieved successfully',
                STATUS_CODES.OK,
                { requirements, total: formattedConsultants.length }
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.searchTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Calculate capacity
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async calculateCapacity(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            logger.info(`Calculating capacity for consultant: ${consultantId}`);

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.capacity');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.read');

            // Parse period
            const period = this.#parseDateRange(req.query);

            // Parse options
            const options = {
                includeProjections: req.query.includeProjections === 'true',
                includeRecommendations: req.query.includeRecommendations !== 'false',
                granularity: req.query.granularity || 'daily'
            };

            // Calculate capacity
            const capacityAnalysis = await this.#availabilityService.calculateCapacity(
                consultantId,
                period,
                options
            );

            // Log access
            await this.#logControllerAction('CAPACITY_CALCULATED', {
                consultantId,
                period,
                userId: req.user?.id
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                capacityAnalysis,
                'Capacity analysis completed successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.capacityTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Optimize utilization
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async optimizeUtilization(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Optimizing consultant utilization');

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.optimize');

            // Parse filters
            const filters = {
                tenantId: req.tenant?.id,
                consultantIds: req.query.consultantIds ? req.query.consultantIds.split(',') : undefined,
                minUtilization: req.query.minUtilization ? parseFloat(req.query.minUtilization) : undefined,
                maxUtilization: req.query.maxUtilization ? parseFloat(req.query.maxUtilization) : undefined
            };

            // Parse options
            const options = {
                targetUtilization: req.query.targetUtilization ? parseFloat(req.query.targetUtilization) : 80,
                includeRecommendations: req.query.includeRecommendations !== 'false',
                optimizationStrategy: req.query.strategy || 'balanced'
            };

            // Optimize utilization
            const optimizationResults = await this.#availabilityService.optimizeUtilization(
                filters,
                options
            );

            // Log optimization
            await this.#logControllerAction('UTILIZATION_OPTIMIZED', {
                filters,
                underutilizedCount: optimizationResults.underutilized.length,
                overutilizedCount: optimizationResults.overutilized.length,
                userId: req.user?.id
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                optimizationResults,
                'Utilization optimization completed successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Detect conflicts
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async detectConflicts(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            logger.info(`Detecting conflicts for consultant: ${consultantId}`);

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.conflicts');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.read');

            // Parse period
            const period = this.#parseDateRange(req.query);

            // Parse options
            const options = {
                includeResolutions: req.query.includeResolutions !== 'false',
                conflictTypes: req.query.conflictTypes ? req.query.conflictTypes.split(',') : ['all'],
                severity: req.query.severity
            };

            // Detect conflicts
            const conflicts = await this.#availabilityService.detectConflicts(
                consultantId,
                period,
                options
            );

            // Log conflict detection
            await this.#logControllerAction('CONFLICTS_DETECTED', {
                consultantId,
                conflictsFound: conflicts.length,
                period,
                userId: req.user?.id
            });

            // Format response
            const formattedConflicts = conflicts.map(conflict => 
                this.#formatConflictResponse(conflict)
            );

            const response = this.#responseFormatter.formatSuccess(
                formattedConflicts,
                'Conflict detection completed successfully',
                STATUS_CODES.OK,
                { period, conflictsCount: conflicts.length }
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Resolve conflict
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async resolveConflict(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId, conflictId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Resolving conflict: ${conflictId} for consultant: ${consultantId}`);

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.resolve_conflicts');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.write');

            // Validate resolution data
            await this.#validateConflictResolution(req.body);

            // Prepare resolution data
            const resolution = {
                strategy: req.body.strategy,
                parameters: req.body.parameters || {},
                reason: req.body.reason,
                priority: req.body.priority || 'normal'
            };

            // Resolution options
            const options = {
                autoApply: req.body.autoApply === true,
                skipNotifications: req.body.skipNotifications === true
            };

            // Resolve conflict
            const resolutionResult = await this.#availabilityService.resolveConflict(
                consultantId,
                conflictId,
                resolution,
                userId,
                options
            );

            // Log conflict resolution
            await this.#logControllerAction('CONFLICT_RESOLVED', {
                consultantId,
                conflictId,
                strategy: resolution.strategy,
                userId
            });

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendConflictNotification('resolved', resolutionResult, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                resolutionResult,
                'Conflict resolved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Generate utilization report
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async generateUtilizationReport(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Generating utilization report');

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.reports');

            // Parse filters
            const filters = {
                tenantId: req.tenant?.id,
                consultantIds: req.query.consultantIds ? req.query.consultantIds.split(',') : undefined,
                departments: req.query.departments ? req.query.departments.split(',') : undefined,
                levels: req.query.levels ? req.query.levels.split(',') : undefined
            };

            // Parse options
            const options = {
                startDate: req.query.startDate ? new Date(req.query.startDate) : moment().startOf('month').toDate(),
                endDate: req.query.endDate ? new Date(req.query.endDate) : moment().endOf('month').toDate(),
                groupBy: req.query.groupBy || 'consultant',
                includeProjections: req.query.includeProjections === 'true',
                includeAnalytics: req.query.includeAnalytics !== 'false'
            };

            // Generate report
            const utilizationReport = await this.#availabilityService.generateUtilizationReport(
                filters,
                options
            );

            // Log report generation
            await this.#logControllerAction('UTILIZATION_REPORT_GENERATED', {
                filters,
                consultantsAnalyzed: utilizationReport.summary.totalConsultants,
                userId: req.user?.id
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                utilizationReport,
                'Utilization report generated successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.reportTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Forecast availability
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async forecastAvailability(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Forecasting availability');

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.forecast');

            // Parse requirements
            const requirements = {
                tenantId: req.tenant?.id,
                forecastPeriod: parseInt(req.query.forecastPeriod) || 90,
                skills: req.query.skills ? req.query.skills.split(',') : [],
                minAvailability: req.query.minAvailability ? parseFloat(req.query.minAvailability) : 50,
                projectDemand: req.query.projectDemand ? parseInt(req.query.projectDemand) : undefined
            };

            // Parse options
            const options = {
                includeConfidence: req.query.includeConfidence !== 'false',
                includeRecommendations: req.query.includeRecommendations !== 'false',
                granularity: req.query.granularity || 'weekly'
            };

            // Generate forecast
            const availabilityForecast = await this.#availabilityService.forecastAvailability(
                requirements,
                options
            );

            // Log forecast generation
            await this.#logControllerAction('AVAILABILITY_FORECAST_GENERATED', {
                requirements,
                forecastPeriod: requirements.forecastPeriod,
                consultantsAnalyzed: availabilityForecast.availability.length,
                userId: req.user?.id
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                availabilityForecast,
                'Availability forecast generated successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.forecastTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Bulk update availability
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async bulkUpdateAvailability(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const userId = req.user?.id || req.user?.adminId;
            logger.info('Bulk updating consultant availability');

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.bulk_update');

            const { updates } = req.body;

            // Validate bulk data
            if (!Array.isArray(updates)) {
                throw new ValidationError('Updates data must be an array', 'INVALID_BULK_DATA');
            }

            if (updates.length > this.#bulkConfig.maxUpdatesPerOperation) {
                throw new ValidationError(
                    `Bulk operation exceeds maximum size of ${this.#bulkConfig.maxUpdatesPerOperation}`,
                    'BULK_SIZE_EXCEEDED'
                );
            }

            // Validate each update
            for (const update of updates) {
                await this.#validateBulkAvailabilityUpdate(update);
            }

            // Prepare options
            const options = {
                validateAll: req.body.validateAll !== false,
                stopOnError: req.body.stopOnError === true,
                skipNotifications: req.body.skipNotifications === true,
                tenantId: req.tenant?.id
            };

            // Execute bulk update
            const results = await this.#availabilityService.bulkUpdateAvailability(
                updates,
                userId,
                options
            );

            // Log bulk operation
            await this.#logControllerAction('BULK_AVAILABILITY_UPDATED', {
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length,
                userId
            });

            // Send notifications
            if (!options.skipNotifications && results.successful.length > 0) {
                await this.#sendBulkAvailabilityNotification('updated', results.successful, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                results,
                `Bulk operation completed: ${results.successful.length} updated, ${results.failed.length} failed`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Export availability report
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async exportAvailabilityReport(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Exporting availability report');

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.export');

            // Parse export parameters
            const filters = this.#parseAvailabilityFilters(req.query);
            const format = req.query.format || 'excel';
            const dateRange = this.#parseDateRange(req.query);

            // Validate format
            if (!this.#bookingConfig.exportFormats.includes(format.toLowerCase())) {
                throw new ValidationError(
                    `Unsupported export format. Supported formats: ${this.#bookingConfig.exportFormats.join(', ')}`,
                    'INVALID_FORMAT'
                );
            }

            // Prepare export options
            const options = {
                tenantId: req.tenant?.id,
                userId: req.user?.id,
                includeBookings: req.query.includeBookings === 'true',
                includeUtilization: req.query.includeUtilization !== 'false',
                dateRange,
                maxRecords: this.#bookingConfig.maxExportRecords
            };

            // Export data
            const exportBuffer = await this.#availabilityService.exportAvailabilityReport(
                filters,
                format,
                options
            );

            // Log export
            await this.#logControllerAction('AVAILABILITY_EXPORTED', {
                format,
                filters,
                dateRange,
                userId: options.userId
            });

            // Set response headers
            const fileName = `availability_report_${Date.now()}.${format}`;
            const contentType = this.#getContentType(format);

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Length', exportBuffer.length);

            res.status(STATUS_CODES.OK).send(exportBuffer);
        })(req, res, next);
    }

    /**
     * Get availability dashboard
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getAvailabilityDashboard(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Fetching availability dashboard');

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.dashboard');

            // Parse options
            const options = {
                tenantId: req.tenant?.id,
                dateRange: this.#parseDateRange(req.query),
                includeMetrics: req.query.includeMetrics !== 'false',
                includeTrends: req.query.includeTrends === 'true',
                includeAlerts: req.query.includeAlerts === 'true',
                granularity: req.query.granularity || 'daily'
            };

            // Get dashboard data
            const dashboardData = await this.#availabilityService.getAvailabilityDashboard(options);

            // Log access
            await this.#logControllerAction('AVAILABILITY_DASHBOARD_ACCESSED', {
                userId: req.user?.id,
                dateRange: options.dateRange
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                dashboardData,
                'Availability dashboard data retrieved successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.dashboardTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Update working hours
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updateWorkingHours(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating working hours for consultant: ${consultantId}`);

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.update_schedule');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.write');

            // Validate working hours data
            await this.#validateWorkingHoursData(req.body);

            // Prepare schedule update
            const scheduleUpdate = {
                type: 'working_hours',
                workingHours: this.#normalizeWorkingHours(req.body.workingHours),
                timeZone: req.body.timeZone,
                effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : new Date()
            };

            // Update working hours
            const result = await this.#availabilityService.updateSchedule(
                consultantId,
                scheduleUpdate,
                userId,
                { skipNotifications: req.body.skipNotifications === true }
            );

            // Log update
            await this.#logControllerAction('WORKING_HOURS_UPDATED', {
                consultantId,
                effectiveDate: scheduleUpdate.effectiveDate,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatAvailabilityResponse(result),
                'Working hours updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Add time off
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async addTimeOff(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Adding time off for consultant: ${consultantId}`);

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'consultant_availability.add_timeoff');
            await this.#checkConsultantAccess(consultantId, req.user, 'availability.write');

            // Validate time off data
            await this.#validateTimeOffData(req.body);

            // Prepare schedule update
            const scheduleUpdate = {
                type: 'time_off',
                timeOffType: req.body.type || 'vacation',
                period: {
                    start: new Date(req.body.period.start),
                    end: new Date(req.body.period.end)
                },
                reason: req.body.reason,
                isRecurring: req.body.isRecurring === true,
                recurringPattern: req.body.recurringPattern
            };

            // Add time off
            const result = await this.#availabilityService.updateSchedule(
                consultantId,
                scheduleUpdate,
                userId,
                { skipNotifications: req.body.skipNotifications === true }
            );

            // Log time off addition
            await this.#logControllerAction('TIME_OFF_ADDED', {
                consultantId,
                timeOffType: scheduleUpdate.timeOffType,
                period: scheduleUpdate.period,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatAvailabilityResponse(result),
                'Time off added successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Private helper methods
     */

    #initializeConfigurations() {
        this.#validationConfig = {
            maxBookingDuration: 8760, // hours (1 year)
            minBookingDuration: 0.5, // hours (30 minutes)
            maxAdvanceBooking: 365, // days
            allowedBookingStatuses: ['tentative', 'confirmed', 'cancelled', 'completed'],
            allowedAllocationTypes: ['hours', 'percentage', 'days']
        };

        this.#securityConfig = {
            requireMFA: false,
            auditSensitiveFields: ['bookings', 'capacity', 'schedule'],
            encryptFields: ['externalCalendar.credentials']
        };

        this.#cacheConfig = {
            availabilityTTL: 900, // 15 minutes
            searchTTL: 600, // 10 minutes
            capacityTTL: 1800, // 30 minutes
            reportTTL: 3600, // 1 hour
            forecastTTL: 7200, // 2 hours
            dashboardTTL: 900 // 15 minutes
        };

        this.#bulkConfig = {
            maxUpdatesPerOperation: 200,
            maxBookingsPerOperation: 100,
            batchSize: 50,
            maxConcurrency: 5
        };

        this.#bookingConfig = {
            defaultDuration: 8, // hours
            allowedPriorities: ['low', 'medium', 'high', 'critical'],
            allowedTypes: ['project', 'meeting', 'training', 'leave', 'admin'],
            exportFormats: ['excel', 'csv', 'ical'],
            maxExportRecords: 25000
        };

        this.#scheduleConfig = {
            allowedUpdateTypes: ['working_hours', 'time_off', 'recurring_commitment', 'exception'],
            allowedTimeOffTypes: ['vacation', 'sick', 'personal', 'training', 'conference'],
            maxExceptionsPerMonth: 20
        };

        this.#capacityConfig = {
            defaultHoursPerDay: 8,
            defaultDaysPerWeek: 5,
            maxOvertimeHours: 20,
            utilizationThresholds: { low: 50, optimal: 80, high: 95 }
        };

        this.#searchConfig = {
            maxResults: 100,
            defaultTimeframe: 30, // days
            searchableFields: ['skills', 'level', 'location', 'rate']
        };

        this.#paginationConfig = {
            defaultLimit: 20,
            maxLimit: 100,
            defaultSort: { 'availability.currentUtilization': 1 }
        };

        this.#rateLimitConfig = {
            booking: { windowMs: 900000, max: 100 }, // 100 bookings per 15 minutes
            search: { windowMs: 60000, max: 30 }, // 30 searches per minute
            bulk: { windowMs: 3600000, max: 10 } // 10 bulk operations per hour
        };

        this.#conflictConfig = {
            allowedStrategies: ['reschedule', 'reassign', 'split', 'override'],
            autoResolveThreshold: 'low',
            escalationLevels: ['low', 'medium', 'high', 'critical']
        };

        this.#auditConfig = {
            enabled: true,
            sensitiveActions: ['book', 'cancel', 'resolve_conflict', 'bulk_update'],
            retentionDays: 2555
        };
    }

    /**
     * Validates availability initialization data
     * @private
     * @param {Object} data - Availability data
     * @returns {Promise<boolean>}
     */
    async #validateAvailabilityInitData(data) {
        const errors = [];

        if (data.hoursPerDay && (data.hoursPerDay < 1 || data.hoursPerDay > 24)) {
            errors.push('Hours per day must be between 1 and 24');
        }

        if (data.daysPerWeek && (data.daysPerWeek < 1 || data.daysPerWeek > 7)) {
            errors.push('Days per week must be between 1 and 7');
        }

        if (data.timeZone && !moment.tz.names().includes(data.timeZone)) {
            errors.push('Invalid timezone');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'AVAILABILITY_INIT_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Normalizes working hours data
     * @private
     * @param {Object} workingHours - Working hours data
     * @returns {Object} Normalized working hours
     */
    #normalizeWorkingHours(workingHours) {
        if (!workingHours) {
            return {
                timezone: 'UTC',
                regular: {
                    monday: { isWorking: true, start: '09:00', end: '17:00', breaks: [] },
                    tuesday: { isWorking: true, start: '09:00', end: '17:00', breaks: [] },
                    wednesday: { isWorking: true, start: '09:00', end: '17:00', breaks: [] },
                    thursday: { isWorking: true, start: '09:00', end: '17:00', breaks: [] },
                    friday: { isWorking: true, start: '09:00', end: '17:00', breaks: [] },
                    saturday: { isWorking: false, start: '09:00', end: '17:00', breaks: [] },
                    sunday: { isWorking: false, start: '09:00', end: '17:00', breaks: [] }
                }
            };
        }

        return {
            timezone: workingHours.timezone || 'UTC',
            regular: {
                monday: this.#normalizeDaySchedule(workingHours.regular?.monday),
                tuesday: this.#normalizeDaySchedule(workingHours.regular?.tuesday),
                wednesday: this.#normalizeDaySchedule(workingHours.regular?.wednesday),
                thursday: this.#normalizeDaySchedule(workingHours.regular?.thursday),
                friday: this.#normalizeDaySchedule(workingHours.regular?.friday),
                saturday: this.#normalizeDaySchedule(workingHours.regular?.saturday),
                sunday: this.#normalizeDaySchedule(workingHours.regular?.sunday)
            }
        };
    }

    /**
     * Normalizes day schedule
     * @private
     * @param {Object} daySchedule - Day schedule
     * @returns {Object} Normalized day schedule
     */
    #normalizeDaySchedule(daySchedule) {
        return {
            isWorking: daySchedule?.isWorking || false,
            start: daySchedule?.start || '09:00',
            end: daySchedule?.end || '17:00',
            breaks: daySchedule?.breaks || []
        };
    }

    /**
     * Validates capacity data
     * @private
     * @param {Object} capacity - Capacity data
     * @returns {Object} Validated capacity
     */
    #validateCapacityData(capacity) {
        if (!capacity) {
            return {
                hoursPerDay: this.#capacityConfig.defaultHoursPerDay,
                daysPerWeek: this.#capacityConfig.defaultDaysPerWeek,
                hoursPerWeek: this.#capacityConfig.defaultHoursPerDay * this.#capacityConfig.defaultDaysPerWeek
            };
        }

        const validated = { ...capacity };

        if (validated.hoursPerDay && (validated.hoursPerDay < 1 || validated.hoursPerDay > 24)) {
            throw new ValidationError('Hours per day must be between 1 and 24', 'INVALID_CAPACITY');
        }

        if (validated.daysPerWeek && (validated.daysPerWeek < 1 || validated.daysPerWeek > 7)) {
            throw new ValidationError('Days per week must be between 1 and 7', 'INVALID_CAPACITY');
        }

        return validated;
    }

    /**
     * Validates schedule update data
     * @private
     * @param {Object} data - Schedule update data
     * @returns {Promise<boolean>}
     */
    async #validateScheduleUpdate(data) {
        const errors = [];

        if (!data.type) {
            errors.push('Update type is required');
        }

        if (data.type && !this.#scheduleConfig.allowedUpdateTypes.includes(data.type)) {
            errors.push(`Invalid update type. Allowed: ${this.#scheduleConfig.allowedUpdateTypes.join(', ')}`);
        }

        if (data.type === 'time_off' && !data.period) {
            errors.push('Period is required for time off');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'SCHEDULE_UPDATE_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Validates booking data
     * @private
     * @param {Object} data - Booking data
     * @returns {Promise<boolean>}
     */
    async #validateBookingData(data) {
        const errors = [];

        if (!data.period?.start || !data.period?.end) {
            errors.push('Booking period with start and end dates is required');
        }

        if (data.period?.start && data.period?.end) {
            const start = new Date(data.period.start);
            const end = new Date(data.period.end);
            const duration = (end - start) / (1000 * 60 * 60); // hours

            if (end <= start) {
                errors.push('End date must be after start date');
            }

            if (duration < this.#validationConfig.minBookingDuration) {
                errors.push(`Minimum booking duration is ${this.#validationConfig.minBookingDuration} hours`);
            }

            if (duration > this.#validationConfig.maxBookingDuration) {
                errors.push(`Maximum booking duration is ${this.#validationConfig.maxBookingDuration} hours`);
            }

            const advanceDays = (start - new Date()) / (1000 * 60 * 60 * 24);
            if (advanceDays > this.#validationConfig.maxAdvanceBooking) {
                errors.push(`Cannot book more than ${this.#validationConfig.maxAdvanceBooking} days in advance`);
            }
        }

        if (data.priority && !this.#bookingConfig.allowedPriorities.includes(data.priority)) {
            errors.push(`Invalid priority. Allowed: ${this.#bookingConfig.allowedPriorities.join(', ')}`);
        }

        if (data.type && !this.#bookingConfig.allowedTypes.includes(data.type)) {
            errors.push(`Invalid booking type. Allowed: ${this.#bookingConfig.allowedTypes.join(', ')}`);
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'BOOKING_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Validates allocation data
     * @private
     * @param {Object} allocation - Allocation data
     * @returns {Object} Validated allocation
     */
    #validateAllocationData(allocation) {
        if (!allocation) {
            return { percentage: 100, type: 'percentage' };
        }

        const validated = { ...allocation };

        if (validated.percentage && (validated.percentage < 0 || validated.percentage > 100)) {
            throw new ValidationError('Allocation percentage must be between 0 and 100', 'INVALID_ALLOCATION');
        }

        if (validated.type && !this.#validationConfig.allowedAllocationTypes.includes(validated.type)) {
            throw new ValidationError(
                `Invalid allocation type. Allowed: ${this.#validationConfig.allowedAllocationTypes.join(', ')}`,
                'INVALID_ALLOCATION_TYPE'
            );
        }

        return validated;
    }

    /**
     * Validates time slot availability
     * @private
     * @param {string} consultantId - Consultant ID
     * @param {Object} period - Time period
     * @param {string} excludeBookingId - Booking ID to exclude from conflict check
     * @returns {Promise<boolean>}
     */
    async #validateTimeSlotAvailability(consultantId, period, excludeBookingId = null) {
        try {
            const conflicts = await this.#availabilityService.checkTimeSlotConflicts(
                consultantId,
                period,
                { excludeBookingId }
            );

            if (conflicts.length > 0) {
                throw new ConflictError(
                    'Time slot conflicts with existing bookings',
                    'TIME_SLOT_CONFLICT',
                    { conflicts }
                );
            }

            return true;
        } catch (error) {
            if (error instanceof ConflictError) {
                throw error;
            }
            logger.warn('Error validating time slot availability', { consultantId, period, error: error.message });
            return true; // Allow booking if validation fails
        }
    }

    /**
     * Validates booking update data
     * @private
     * @param {Object} data - Booking update data
     * @returns {Promise<boolean>}
     */
    async #validateBookingUpdateData(data) {
        const errors = [];

        if (data.status && !this.#validationConfig.allowedBookingStatuses.includes(data.status)) {
            errors.push(`Invalid status. Allowed: ${this.#validationConfig.allowedBookingStatuses.join(', ')}`);
        }

        if (data.period) {
            if (!data.period.start || !data.period.end) {
                errors.push('Period must include both start and end dates');
            }

            if (data.period.start && data.period.end) {
                const start = new Date(data.period.start);
                const end = new Date(data.period.end);

                if (end <= start) {
                    errors.push('End date must be after start date');
                }
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'BOOKING_UPDATE_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Parses availability requirements from query
     * @private
     * @param {Object} query - Query parameters
     * @returns {Object} Availability requirements
     */
    #parseAvailabilityRequirements(query) {
        const requirements = {};

        if (query.startDate && query.endDate) {
            requirements.startDate = new Date(query.startDate);
            requirements.endDate = new Date(query.endDate);
        }

        if (query.requiredSkills) {
            requirements.requiredSkills = query.requiredSkills.split(',');
        }

        if (query.preferredSkills) {
            requirements.preferredSkills = query.preferredSkills.split(',');
        }

        if (query.level) {
            requirements.level = query.level;
        }

        if (query.allocation) {
            requirements.allocation = parseFloat(query.allocation);
        }

        if (query.maxRate) {
            requirements.maxRate = parseFloat(query.maxRate);
        }

        if (query.location) {
            requirements.location = query.location;
        }

        return requirements;
    }

    /**
     * Parses date range from query
     * @private
     * @param {Object} query - Query parameters
     * @returns {Object} Date range
     */
    #parseDateRange(query) {
        const defaultStart = new Date();
        const defaultEnd = moment().add(this.#searchConfig.defaultTimeframe, 'days').toDate();

        return {
            start: query.startDate ? new Date(query.startDate) : defaultStart,
            end: query.endDate ? new Date(query.endDate) : defaultEnd
        };
    }

    /**
     * Parses availability filters
     * @private
     * @param {Object} query - Query parameters
     * @returns {Object} Filters
     */
    #parseAvailabilityFilters(query) {
        const filters = {};

        if (query.consultantIds) {
            filters.consultantIds = query.consultantIds.split(',');
        }

        if (query.status) {
            filters.status = query.status;
        }

        if (query.utilizationMin || query.utilizationMax) {
            filters.utilization = {};
            if (query.utilizationMin) filters.utilization.min = parseFloat(query.utilizationMin);
            if (query.utilizationMax) filters.utilization.max = parseFloat(query.utilizationMax);
        }

        return filters;
    }

    /**
     * Validates conflict resolution data
     * @private
     * @param {Object} data - Resolution data
     * @returns {Promise<boolean>}
     */
    async #validateConflictResolution(data) {
        const errors = [];

        if (!data.strategy) {
            errors.push('Resolution strategy is required');
        }

        if (data.strategy && !this.#conflictConfig.allowedStrategies.includes(data.strategy)) {
            errors.push(`Invalid strategy. Allowed: ${this.#conflictConfig.allowedStrategies.join(', ')}`);
        }

        if (!data.reason) {
            errors.push('Resolution reason is required');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'CONFLICT_RESOLUTION_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Validates working hours data
     * @private
     * @param {Object} data - Working hours data
     * @returns {Promise<boolean>}
     */
    async #validateWorkingHoursData(data) {
        const errors = [];

        if (!data.workingHours) {
            errors.push('Working hours data is required');
        }

        if (data.timeZone && !moment.tz.names().includes(data.timeZone)) {
            errors.push('Invalid timezone');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'WORKING_HOURS_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Validates time off data
     * @private
     * @param {Object} data - Time off data
     * @returns {Promise<boolean>}
     */
    async #validateTimeOffData(data) {
        const errors = [];

        if (!data.period?.start || !data.period?.end) {
            errors.push('Time off period with start and end dates is required');
        }

        if (data.period?.start && data.period?.end) {
            const start = new Date(data.period.start);
            const end = new Date(data.period.end);

            if (end <= start) {
                errors.push('End date must be after start date');
            }
        }

        if (data.type && !this.#scheduleConfig.allowedTimeOffTypes.includes(data.type)) {
            errors.push(`Invalid time off type. Allowed: ${this.#scheduleConfig.allowedTimeOffTypes.join(', ')}`);
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'TIME_OFF_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Validates bulk availability update
     * @private
     * @param {Object} update - Update data
     * @returns {Promise<boolean>}
     */
    async #validateBulkAvailabilityUpdate(update) {
        const errors = [];

        if (!update.consultantId) {
            errors.push('Consultant ID is required');
        }

        if (!CommonValidator.isValidObjectId(update.consultantId)) {
            errors.push('Invalid consultant ID format');
        }

        if (!update.type) {
            errors.push('Update type is required');
        }

        if (update.type && !this.#scheduleConfig.allowedUpdateTypes.includes(update.type)) {
            errors.push(`Invalid update type. Allowed: ${this.#scheduleConfig.allowedUpdateTypes.join(', ')}`);
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'BULK_UPDATE_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Checks user permissions
     * @private
     * @param {Object} req - Request object
     * @param {string} permission - Permission to check
     * @returns {Promise<boolean>}
     */
    async #checkPermission(req, permission) {
        const user = req.user;

        if (!user) {
            throw new ForbiddenError('Authentication required', 'AUTH_REQUIRED');
        }

        if (user.role === 'super_admin' || user.isSuperAdmin) {
            return true;
        }

        const hasPermission = user.role === 'admin' ||
            user.permissions?.includes(permission) ||
            user.roles?.some(role => role.permissions?.includes(permission)) ||
            user.tenantPermissions?.includes(permission);

        if (!hasPermission) {
            throw new ForbiddenError(`Insufficient permissions: ${permission}`, 'PERMISSION_DENIED');
        }

        return true;
    }

    /**
     * Checks consultant access permissions
     * @private
     * @param {string} consultantId - Consultant ID
     * @param {Object} user - User object
     * @param {string} action - Action being performed
     * @returns {Promise<boolean>}
     */
    async #checkConsultantAccess(consultantId, user, action) {
        if (user.role === 'super_admin' || user.isSuperAdmin) {
            return true;
        }

        // Allow self-access for availability
        if (consultantId === user.consultantId || consultantId === user.id) {
            return true;
        }

        // Check if user is manager or has appropriate permissions
        const hasManagerAccess = user.role === 'admin' || 
            user.permissions?.includes(`consultant_availability.${action}_all`);

        if (!hasManagerAccess) {
            throw new ForbiddenError(`Access denied for consultant availability: ${action}`, 'CONSULTANT_ACCESS_DENIED');
        }

        return true;
    }

    /**
     * Formats availability response
     * @private
     * @param {Object} availability - Availability object
     * @returns {Object} Formatted availability
     */
    #formatAvailabilityResponse(availability) {
        if (!availability) return null;

        return {
            id: availability._id,
            availabilityId: availability.availabilityId,
            consultantId: availability.consultantId,
            currentStatus: availability.currentStatus,
            capacity: availability.capacity,
            schedule: {
                workingHours: availability.schedule?.workingHours,
                timeOff: availability.schedule?.timeOff,
                exceptions: availability.schedule?.exceptions
            },
            allocations: {
                current: availability.allocations?.current?.map(allocation => this.#formatBookingResponse(allocation)),
                history: availability.allocations?.history?.slice(0, 10) // Limit history
            },
            conflicts: availability.conflicts?.scheduling?.map(conflict => this.#formatConflictResponse(conflict)),
            utilization: availability.utilization,
            metadata: availability.metadata,
            createdAt: availability.createdAt,
            updatedAt: availability.updatedAt
        };
    }

    /**
     * Formats booking response
     * @private
     * @param {Object} booking - Booking object
     * @returns {Object} Formatted booking
     */
    #formatBookingResponse(booking) {
        if (!booking) return null;

        return {
            id: booking._id,
            allocationId: booking.allocationId,
            type: booking.type,
            projectId: booking.projectId,
            clientId: booking.clientId,
            period: booking.period,
            allocation: booking.allocation,
            status: booking.status,
            priority: booking.priority,
            billable: booking.billable,
            rate: booking.rate,
            location: booking.location,
            requestedBy: booking.requestedBy,
            notes: booking.notes,
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt
        };
    }

    /**
     * Formats available consultant response
     * @private
     * @param {Object} consultant - Consultant object
     * @returns {Object} Formatted consultant
     */
    #formatAvailableConsultantResponse(consultant) {
        return {
            consultantId: consultant._id,
            name: consultant.fullName,
            level: consultant.profile?.level,
            skills: consultant.skills?.technical?.slice(0, 5),
            availability: consultant.availability,
            availabilityScore: consultant.availabilityScore,
            skillScore: consultant.skillScore,
            totalScore: consultant.totalScore,
            recommendation: consultant.recommendation,
            rate: consultant.billing?.standardRate,
            location: consultant.location
        };
    }

    /**
     * Formats conflict response
     * @private
     * @param {Object} conflict - Conflict object
     * @returns {Object} Formatted conflict
     */
    #formatConflictResponse(conflict) {
        return {
            id: conflict._id,
            type: conflict.type,
            severity: conflict.severity,
            description: conflict.description,
            period: conflict.period,
            affectedBookings: conflict.affectedBookings,
            resolutionOptions: conflict.resolutionOptions,
            status: conflict.status,
            detectedAt: conflict.detectedAt
        };
    }

    /**
     * Gets calendar integration data
     * @private
     * @param {string} consultantId - Consultant ID
     * @returns {Promise<Object>} Calendar integration data
     */
    async #getCalendarIntegrationData(consultantId) {
        try {
            return await this.#calendarService.getIntegrationStatus(consultantId);
        } catch (error) {
            logger.warn('Failed to get calendar integration data', { consultantId, error: error.message });
            return null;
        }
    }

    /**
     * Gets content type for file format
     * @private
     * @param {string} format - File format
     * @returns {string} Content type
     */
    #getContentType(format) {
        const contentTypes = {
            excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            csv: 'text/csv',
            ical: 'text/calendar'
        };
        return contentTypes[format.toLowerCase()] || 'application/octet-stream';
    }

    /**
     * Logs controller actions
     * @private
     * @param {string} action - Action name
     * @param {Object} data - Action data
     * @returns {Promise<void>}
     */
    async #logControllerAction(action, data) {
        try {
            const logEntry = {
                category: 'CONSULTANT_AVAILABILITY_CONTROLLER',
                action,
                timestamp: new Date(),
                data
            };

            logger.audit(logEntry);
        } catch (error) {
            logger.error('Error logging controller action:', { action, error: error.message });
        }
    }

    /**
     * Sends availability notifications
     * @private
     * @param {string} eventType - Event type
     * @param {Object} availability - Availability object
     * @param {Object} user - User object
     * @returns {Promise<void>}
     */
    async #sendAvailabilityNotification(eventType, availability, user) {
        try {
            logger.debug(`Sending ${eventType} notification for availability ${availability._id}`);
        } catch (error) {
            logger.error('Error sending availability notification:', { eventType, error: error.message });
        }
    }

    /**
     * Sends booking notifications
     * @private
     * @param {string} eventType - Event type
     * @param {Object} booking - Booking object
     * @param {Object} user - User object
     * @returns {Promise<void>}
     */
    async #sendBookingNotification(eventType, booking, user) {
        try {
            logger.debug(`Sending booking ${eventType} notification`);
        } catch (error) {
            logger.error('Error sending booking notification:', { eventType, error: error.message });
        }
    }

    /**
     * Sends conflict notifications
     * @private
     * @param {string} eventType - Event type
     * @param {Object} conflict - Conflict object
     * @param {Object} user - User object
     * @returns {Promise<void>}
     */
    async #sendConflictNotification(eventType, conflict, user) {
        try {
            logger.debug(`Sending conflict ${eventType} notification`);
        } catch (error) {
            logger.error('Error sending conflict notification:', { eventType, error: error.message });
        }
    }

    /**
     * Sends bulk availability notifications
     * @private
     * @param {string} eventType - Event type
     * @param {Array} results - Results array
     * @param {Object} user - User object
     * @returns {Promise<void>}
     */
    async #sendBulkAvailabilityNotification(eventType, results, user) {
        try {
            logger.debug(`Sending bulk availability ${eventType} notification for ${results.length} updates`);
        } catch (error) {
            logger.error('Error sending bulk availability notification:', { eventType, error: error.message });
        }
    }
}

// Export controller as singleton instance
module.exports = new ConsultantAvailabilityController();