'use strict';

/**
 * @fileoverview Enterprise consultant availability service with comprehensive scheduling and capacity management
 * @module servers/customer-services/modules/core-business/consultants/services/consultant-availability-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/calendar-service
 * @requires module:servers/customer-services/modules/core-business/consultants/models/consultant-availability-model
 * @requires module:servers/customer-services/modules/core-business/consultants/models/consultant-model
 */

const mongoose = require('mongoose');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const asyncHandler = require('../../../../../../shared/lib/utils/async-handler');
const CacheService = require('../../../../../../shared/lib/services/cache-service');
const EmailService = require('../../../../../../shared/lib/services/email-service');
const NotificationService = require('../../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../../shared/lib/security/audit/audit-service');
const CalendarService = require('../../../../../../shared/lib/services/calendar-service');
const ConsultantAvailabilityModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultants/consultant-availability-model');
const ConsultantModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultants/consultant-model');
const ProjectModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/projects/project-model');
const ExcelJS = require('exceljs');
const moment = require('moment-timezone');
const crypto = require('crypto');
const rrule = require('rrule');

/**
 * Enterprise consultant availability service for comprehensive scheduling management
 * @class ConsultantAvailabilityService
 * @description Manages availability scheduling, booking, capacity planning, and utilization analytics
 */
class ConsultantAvailabilityService {
    /**
     * @private
     * @type {CacheService}
     */
    #cacheService;

    /**
     * @private
     * @type {EmailService}
     */
    #emailService;

    /**
     * @private
     * @type {NotificationService}
     */
    #notificationService;

    /**
     * @private
     * @type {AuditService}
     */
    #auditService;

    /**
     * @private
     * @type {CalendarService}
     */
    #calendarService;

    /**
     * @private
     * @type {number}
     */
    #defaultCacheTTL = 1800; // 30 minutes

    /**
     * @private
     * @type {number}
     */
    #maxBookingsPerDay = 10;

    /**
     * @private
     * @type {number}
     */
    #maxRecurringMonths = 12;

    /**
     * @private
     * @type {Object}
     */
    #utilizationTargets = {
        junior: { min: 50, target: 60, max: 80 },
        mid: { min: 60, target: 70, max: 85 },
        senior: { min: 70, target: 80, max: 90 },
        lead: { min: 65, target: 75, max: 85 },
        principal: { min: 60, target: 70, max: 80 },
        director: { min: 50, target: 60, max: 70 },
        partner: { min: 40, target: 50, max: 60 }
    };

    /**
     * @private
     * @type {Object}
     */
    #bookingPriorities = {
        critical: { weight: 10, canOverride: true },
        high: { weight: 7, canOverride: false },
        medium: { weight: 5, canOverride: false },
        low: { weight: 3, canOverride: false }
    };

    /**
     * @private
     * @type {Object}
     */
    #conflictResolutionStrategies = {
        auto: 'automatic',
        manual: 'manual_review',
        escalate: 'escalate_to_manager',
        reject: 'reject_booking'
    };

    /**
     * @private
     * @type {Map}
     */
    #pendingBookings = new Map();

    /**
     * @private
     * @type {Map}
     */
    #utilizationCache = new Map();

    /**
     * Creates an instance of ConsultantAvailabilityService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#auditService = dependencies.auditService || new AuditService();
        this.#calendarService = dependencies.calendarService || new CalendarService();

        this.#initializeService();
    }

    /**
     * Initialize service components
     * @private
     */
    #initializeService() {
        logger.info('Initializing ConsultantAvailabilityService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            auditEnabled: !!this.#auditService,
            calendarEnabled: !!this.#calendarService
        });

        // Start periodic tasks
        this.#startPeriodicTasks();
    }

    // ==================== Availability Management ====================

    /**
     * Initialize consultant availability
     * @param {string} consultantId - Consultant ID
     * @param {Object} availabilityData - Initial availability settings
     * @param {string} userId - User initializing availability
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created availability record
     */
    async initializeAvailability(consultantId, availabilityData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Validate consultant exists
            const consultant = await ConsultantModel.findById(consultantId);
            if (!consultant) {
                throw new NotFoundError('Consultant not found', 'CONSULTANT_NOT_FOUND');
            }

            // Check for existing availability
            const existing = await ConsultantAvailabilityModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (existing) {
                throw new ConflictError('Availability already initialized', 'AVAILABILITY_EXISTS');
            }

            // Validate availability data
            await this.#validateAvailabilityData(availabilityData);

            // Generate availability ID
            const availabilityId = await ConsultantAvailabilityModel.generateAvailabilityId();

            // Get utilization targets based on level
            const targets = this.#utilizationTargets[consultant.profile.level] || this.#utilizationTargets.mid;

            // Create availability record
            const availability = await ConsultantAvailabilityModel.create([{
                availabilityId,
                consultantId,
                tenantId: consultant.tenantId,
                organizationId: consultant.organizationId,
                currentStatus: {
                    status: availabilityData.status || 'available',
                    effectiveFrom: new Date(),
                    autoUpdate: true
                },
                capacity: {
                    standard: {
                        hoursPerDay: availabilityData.hoursPerDay || 8,
                        daysPerWeek: availabilityData.daysPerWeek || 5,
                        hoursPerWeek: availabilityData.hoursPerWeek || 40,
                        hoursPerMonth: availabilityData.hoursPerMonth || 160,
                        utilizationTarget: targets.target
                    },
                    constraints: {
                        maxConsecutiveHours: 10,
                        maxProjectsSimultaneous: 3,
                        maxOvertimePerWeek: 10,
                        maxTravelDaysPerMonth: 10
                    }
                },
                schedule: {
                    workingHours: this.#generateDefaultWorkingHours(availabilityData.workingHours),
                    calendar: []
                },
                location: {
                    base: availabilityData.location || {},
                    current: availabilityData.location || {}
                }
            }], { session });

            // Initialize calendar for next 3 months
            await this.#initializeCalendar(availability[0], session);

            // Sync with external calendar if configured
            if (availabilityData.externalCalendar) {
                await this.#syncExternalCalendar(availability[0], availabilityData.externalCalendar);
            }

            // Send initialization notifications
            await this.#sendAvailabilityNotifications(consultant, availability[0], 'initialized', userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'AVAILABILITY_INITIALIZED',
                entityType: 'consultant_availability',
                entityId: availability[0]._id,
                userId,
                details: {
                    consultantId,
                    availabilityId: availability[0].availabilityId
                }
            });

            // Clear caches
            await this.#clearAvailabilityCaches(consultant.tenantId, consultantId);

            logger.info('Availability initialized successfully', {
                availabilityId: availability[0].availabilityId,
                consultantId
            });

            return availability[0];
        } catch (error) {
            logger.error('Error initializing availability', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Get consultant availability
     * @param {string} consultantId - Consultant ID
     * @param {Object} dateRange - Date range to check
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Availability information
     */
    async getAvailability(consultantId, dateRange = {}, options = {}) {
        const {
            includeBookings = true,
            includeConflicts = true,
            includeUtilization = true,
            format = 'detailed'
        } = options;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('availability', consultantId, { dateRange, options });
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Get availability record
            const availability = await ConsultantAvailabilityModel.findOne({
                consultantId,
                isDeleted: false
            }).populate('consultantId');

            if (!availability) {
                throw new NotFoundError('Availability not found', 'AVAILABILITY_NOT_FOUND');
            }

            // Build date range
            const startDate = dateRange.start || new Date();
            const endDate = dateRange.end || moment().add(30, 'days').toDate();

            // Get calendar for date range
            const calendar = await this.#getCalendarForRange(availability, startDate, endDate);

            // Build availability response
            const response = {
                consultantId,
                currentStatus: availability.currentStatus,
                capacity: availability.capacity,
                calendar
            };

            // Add bookings if requested
            if (includeBookings) {
                response.bookings = await this.#getBookingsForRange(consultantId, startDate, endDate);
            }

            // Add conflicts if requested
            if (includeConflicts) {
                response.conflicts = await this.#getConflictsForRange(availability, startDate, endDate);
            }

            // Add utilization if requested
            if (includeUtilization) {
                response.utilization = await this.#calculateUtilizationForRange(availability, startDate, endDate);
            }

            // Format response based on requested format
            const formattedResponse = this.#formatAvailabilityResponse(response, format);

            // Cache result
            await this.#cacheService.set(cacheKey, formattedResponse, this.#defaultCacheTTL);

            return formattedResponse;
        } catch (error) {
            logger.error('Error getting availability', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Update availability schedule
     * @param {string} consultantId - Consultant ID
     * @param {Object} scheduleUpdate - Schedule update data
     * @param {string} userId - User updating schedule
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated availability
     */
    async updateSchedule(consultantId, scheduleUpdate, userId, options = {}) {
        const session = options.session || null;

        try {
            const availability = await ConsultantAvailabilityModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!availability) {
                throw new NotFoundError('Availability not found', 'AVAILABILITY_NOT_FOUND');
            }

            // Validate schedule update
            await this.#validateScheduleUpdate(scheduleUpdate);

            // Check for conflicts with existing bookings
            const conflicts = await this.#checkScheduleUpdateConflicts(availability, scheduleUpdate);
            
            if (conflicts.length > 0 && !options.forceUpdate) {
                throw new ConflictError('Schedule update conflicts with existing bookings', 'SCHEDULE_CONFLICT', { conflicts });
            }

            // Apply schedule updates
            switch (scheduleUpdate.type) {
                case 'working_hours':
                    await this.#updateWorkingHours(availability, scheduleUpdate, session);
                    break;
                    
                case 'time_off':
                    await this.#addTimeOff(availability, scheduleUpdate, userId, session);
                    break;
                    
                case 'recurring_commitment':
                    await this.#addRecurringCommitment(availability, scheduleUpdate, session);
                    break;
                    
                case 'exception':
                    await this.#addScheduleException(availability, scheduleUpdate, session);
                    break;
                    
                default:
                    throw new ValidationError(`Invalid schedule update type: ${scheduleUpdate.type}`, 'INVALID_UPDATE_TYPE');
            }

            // Recalculate capacity
            availability.calculateCapacity();
            
            // Update calendar
            await this.#regenerateCalendar(availability, scheduleUpdate.affectedDates);

            await availability.save({ session });

            // Handle conflicts if forced
            if (conflicts.length > 0 && options.forceUpdate) {
                await this.#resolveScheduleConflicts(availability, conflicts, userId);
            }

            // Send schedule update notifications
            await this.#sendScheduleUpdateNotifications(availability, scheduleUpdate, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'SCHEDULE_UPDATED',
                entityType: 'consultant_availability',
                entityId: availability._id,
                userId,
                details: {
                    updateType: scheduleUpdate.type,
                    consultantId
                }
            });

            // Clear caches
            await this.#clearAvailabilityCaches(availability.tenantId, consultantId);

            return availability;
        } catch (error) {
            logger.error('Error updating schedule', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ==================== Booking Management ====================

    /**
     * Create booking for consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} bookingData - Booking details
     * @param {string} userId - User creating booking
     * @param {Object} options - Booking options
     * @returns {Promise<Object>} Created booking
     */
    async createBooking(consultantId, bookingData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Get availability
            const availability = await ConsultantAvailabilityModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!availability) {
                throw new NotFoundError('Availability not found', 'AVAILABILITY_NOT_FOUND');
            }

            // Validate booking data
            await this.#validateBookingData(bookingData);

            // Check consultant availability for period
            const availabilityCheck = await this.#checkAvailabilityForBooking(availability, bookingData);
            
            if (!availabilityCheck.isAvailable) {
                throw new ConflictError(
                    `Consultant not available: ${availabilityCheck.reason}`,
                    'NOT_AVAILABLE',
                    { availabilityCheck }
                );
            }

            // Check for conflicts
            const conflicts = await this.#checkBookingConflicts(availability, bookingData);
            
            if (conflicts.length > 0) {
                // Handle conflicts based on priority
                const resolution = await this.#resolveBookingConflicts(conflicts, bookingData, options);
                
                if (!resolution.canProceed) {
                    throw new ConflictError('Booking conflicts cannot be resolved', 'BOOKING_CONFLICT', { conflicts });
                }
            }

            // Create booking allocation
            const booking = await availability.bookAllocation({
                type: bookingData.type,
                projectId: bookingData.projectId,
                engagementId: bookingData.engagementId,
                clientId: bookingData.clientId,
                role: bookingData.role,
                period: bookingData.period,
                allocation: bookingData.allocation,
                status: options.tentative ? 'tentative' : 'confirmed',
                priority: bookingData.priority || 'medium',
                billable: bookingData.billable !== false,
                rate: bookingData.rate,
                location: bookingData.location,
                requestedBy: userId,
                notes: bookingData.notes
            });

            // Update calendar
            await this.#updateCalendarWithBooking(availability, booking);

            // Sync with external systems
            if (availability.integration?.externalCalendars?.length > 0) {
                await this.#syncBookingToExternalCalendars(availability, booking);
            }

            // Send booking confirmations
            await this.#sendBookingNotifications(availability, booking, 'created', userId);

            // Schedule reminders
            await this.#scheduleBookingReminders(booking, consultantId);

            // Log audit trail
            await this.#auditService.log({
                action: 'BOOKING_CREATED',
                entityType: 'consultant_availability',
                entityId: availability._id,
                userId,
                details: {
                    bookingId: booking.allocationId,
                    consultantId,
                    projectId: booking.projectId,
                    period: booking.period
                }
            });

            // Clear caches
            await this.#clearAvailabilityCaches(availability.tenantId, consultantId);

            return booking;
        } catch (error) {
            logger.error('Error creating booking', {
                error: error.message,
                consultantId,
                bookingData
            });
            throw error;
        }
    }

    /**
     * Update existing booking
     * @param {string} consultantId - Consultant ID
     * @param {string} bookingId - Booking ID
     * @param {Object} updateData - Update data
     * @param {string} userId - User updating booking
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated booking
     */
    async updateBooking(consultantId, bookingId, updateData, userId, options = {}) {
        const session = options.session || null;

        try {
            const availability = await ConsultantAvailabilityModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!availability) {
                throw new NotFoundError('Availability not found', 'AVAILABILITY_NOT_FOUND');
            }

            // Find booking
            const bookingIndex = availability.allocations.current.findIndex(
                a => a.allocationId === bookingId
            );

            if (bookingIndex === -1) {
                throw new NotFoundError('Booking not found', 'BOOKING_NOT_FOUND');
            }

            const booking = availability.allocations.current[bookingIndex];

            // Validate update data
            await this.#validateBookingUpdate(updateData, booking);

            // Check if update creates conflicts
            if (updateData.period || updateData.allocation) {
                const conflicts = await this.#checkBookingUpdateConflicts(
                    availability,
                    booking,
                    updateData
                );

                if (conflicts.length > 0 && !options.forceUpdate) {
                    throw new ConflictError('Booking update creates conflicts', 'UPDATE_CONFLICT', { conflicts });
                }
            }

            // Apply updates
            Object.assign(booking, updateData);

            // Recalculate utilization
            availability.calculateCapacity();

            await availability.save({ session });

            // Update calendar
            await this.#updateCalendarWithBooking(availability, booking);

            // Send update notifications
            await this.#sendBookingNotifications(availability, booking, 'updated', userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'BOOKING_UPDATED',
                entityType: 'consultant_availability',
                entityId: availability._id,
                userId,
                details: {
                    bookingId,
                    consultantId,
                    updates: Object.keys(updateData)
                }
            });

            // Clear caches
            await this.#clearAvailabilityCaches(availability.tenantId, consultantId);

            return booking;
        } catch (error) {
            logger.error('Error updating booking', {
                error: error.message,
                consultantId,
                bookingId
            });
            throw error;
        }
    }

    /**
     * Cancel booking
     * @param {string} consultantId - Consultant ID
     * @param {string} bookingId - Booking ID
     * @param {Object} cancellationData - Cancellation details
     * @param {string} userId - User cancelling booking
     * @param {Object} options - Cancellation options
     * @returns {Promise<boolean>} Success status
     */
    async cancelBooking(consultantId, bookingId, cancellationData, userId, options = {}) {
        const session = options.session || null;

        try {
            const availability = await ConsultantAvailabilityModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!availability) {
                throw new NotFoundError('Availability not found', 'AVAILABILITY_NOT_FOUND');
            }

            // Find and update booking
            const bookingIndex = availability.allocations.current.findIndex(
                a => a.allocationId === bookingId
            );

            if (bookingIndex === -1) {
                throw new NotFoundError('Booking not found', 'BOOKING_NOT_FOUND');
            }

            const booking = availability.allocations.current[bookingIndex];

            // Check cancellation policy
            await this.#validateCancellationPolicy(booking, cancellationData);

            // Update booking status
            booking.status = 'cancelled';
            booking.cancellationReason = cancellationData.reason;
            booking.cancelledBy = userId;
            booking.cancelledAt = new Date();

            // Move to history if needed
            if (options.moveToHistory) {
                availability.allocations.history.push({
                    ...booking.toObject(),
                    completedAt: new Date()
                });
                availability.allocations.current.splice(bookingIndex, 1);
            }

            // Recalculate capacity
            availability.calculateCapacity();

            await availability.save({ session });

            // Update calendar
            await this.#removeBookingFromCalendar(availability, booking);

            // Send cancellation notifications
            await this.#sendBookingNotifications(availability, booking, 'cancelled', userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'BOOKING_CANCELLED',
                entityType: 'consultant_availability',
                entityId: availability._id,
                userId,
                details: {
                    bookingId,
                    consultantId,
                    reason: cancellationData.reason
                }
            });

            // Clear caches
            await this.#clearAvailabilityCaches(availability.tenantId, consultantId);

            return true;
        } catch (error) {
            logger.error('Error cancelling booking', {
                error: error.message,
                consultantId,
                bookingId
            });
            throw error;
        }
    }

    // ==================== Capacity Planning ====================

    /**
     * Calculate capacity for period
     * @param {string} consultantId - Consultant ID
     * @param {Object} period - Time period
     * @param {Object} options - Calculation options
     * @returns {Promise<Object>} Capacity analysis
     */
    async calculateCapacity(consultantId, period = {}, options = {}) {
        try {
            const availability = await ConsultantAvailabilityModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!availability) {
                throw new NotFoundError('Availability not found', 'AVAILABILITY_NOT_FOUND');
            }

            const startDate = period.start || new Date();
            const endDate = period.end || moment().add(90, 'days').toDate();

            // Calculate various capacity metrics
            const capacity = {
                period: { start: startDate, end: endDate },
                standard: availability.capacity.standard,
                current: {
                    totalHours: this.#calculateTotalHours(availability, startDate, endDate),
                    availableHours: this.#calculateAvailableHours(availability, startDate, endDate),
                    allocatedHours: this.#calculateAllocatedHours(availability, startDate, endDate),
                    utilization: 0
                },
                forecast: await this.#forecastCapacity(availability, startDate, endDate),
                constraints: availability.capacity.constraints,
                recommendations: []
            };

            // Calculate utilization percentage
            capacity.current.utilization = capacity.current.totalHours > 0
                ? (capacity.current.allocatedHours / capacity.current.totalHours) * 100
                : 0;

            // Generate capacity recommendations
            capacity.recommendations = await this.#generateCapacityRecommendations(capacity, availability);

            // Check for capacity issues
            capacity.issues = await this.#identifyCapacityIssues(capacity, availability);

            return capacity;
        } catch (error) {
            logger.error('Error calculating capacity', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Optimize consultant utilization
     * @param {Object} filters - Filter criteria
     * @param {Object} options - Optimization options
     * @returns {Promise<Object>} Optimization results
     */
    async optimizeUtilization(filters = {}, options = {}) {
        const { tenantId, targetUtilization = 80 } = options;

        try {
            // Get consultants with availability
            const consultants = await ConsultantAvailabilityModel.find({
                tenantId,
                isDeleted: false,
                'currentStatus.status': { $ne: 'unavailable' }
            }).populate('consultantId');

            const optimizationResults = {
                underutilized: [],
                overutilized: [],
                optimal: [],
                recommendations: []
            };

            for (const availability of consultants) {
                const utilization = availability.capacity.current?.utilization?.current || 0;
                const consultant = availability.consultantId;
                const target = this.#utilizationTargets[consultant.profile.level]?.target || targetUtilization;

                const consultantData = {
                    consultantId: consultant._id,
                    name: consultant.fullName,
                    currentUtilization: utilization,
                    targetUtilization: target,
                    gap: target - utilization
                };

                if (utilization < target - 10) {
                    optimizationResults.underutilized.push(consultantData);
                } else if (utilization > target + 10) {
                    optimizationResults.overutilized.push(consultantData);
                } else {
                    optimizationResults.optimal.push(consultantData);
                }
            }

            // Generate optimization recommendations
            optimizationResults.recommendations = await this.#generateOptimizationRecommendations(
                optimizationResults,
                options
            );

            // Calculate potential improvements
            optimizationResults.potentialImprovements = await this.#calculatePotentialImprovements(
                optimizationResults
            );

            return optimizationResults;
        } catch (error) {
            logger.error('Error optimizing utilization', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    // ==================== Conflict Resolution ====================

    /**
     * Detect scheduling conflicts
     * @param {string} consultantId - Consultant ID
     * @param {Object} period - Time period to check
     * @param {Object} options - Detection options
     * @returns {Promise<Array>} Detected conflicts
     */
    async detectConflicts(consultantId, period = {}, options = {}) {
        try {
            const availability = await ConsultantAvailabilityModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!availability) {
                throw new NotFoundError('Availability not found', 'AVAILABILITY_NOT_FOUND');
            }

            availability.detectConflicts();
            await availability.save();

            // Filter conflicts by period if specified
            let conflicts = availability.conflicts.scheduling;

            if (period.start || period.end) {
                conflicts = conflicts.filter(conflict => {
                    if (period.start && conflict.period.start < period.start) return false;
                    if (period.end && conflict.period.end > period.end) return false;
                    return true;
                });
            }

            // Enhance conflicts with resolution options
            const enhancedConflicts = await Promise.all(
                conflicts.map(async conflict => ({
                    ...conflict.toObject(),
                    resolutionOptions: await this.#generateResolutionOptions(conflict, availability)
                }))
            );

            return enhancedConflicts;
        } catch (error) {
            logger.error('Error detecting conflicts', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Resolve scheduling conflict
     * @param {string} consultantId - Consultant ID
     * @param {string} conflictId - Conflict ID
     * @param {Object} resolution - Resolution details
     * @param {string} userId - User resolving conflict
     * @param {Object} options - Resolution options
     * @returns {Promise<Object>} Resolution result
     */
    async resolveConflict(consultantId, conflictId, resolution, userId, options = {}) {
        const session = options.session || null;

        try {
            const availability = await ConsultantAvailabilityModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!availability) {
                throw new NotFoundError('Availability not found', 'AVAILABILITY_NOT_FOUND');
            }

            const conflict = availability.conflicts.scheduling.id(conflictId);
            if (!conflict) {
                throw new NotFoundError('Conflict not found', 'CONFLICT_NOT_FOUND');
            }

            // Apply resolution strategy
            switch (resolution.strategy) {
                case 'reschedule':
                    await this.#rescheduleConflictingBookings(availability, conflict, resolution, session);
                    break;
                    
                case 'reassign':
                    await this.#reassignConflictingBookings(availability, conflict, resolution, session);
                    break;
                    
                case 'split':
                    await this.#splitConflictingBookings(availability, conflict, resolution, session);
                    break;
                    
                case 'override':
                    await this.#overrideConflict(availability, conflict, resolution, session);
                    break;
                    
                default:
                    throw new ValidationError(`Invalid resolution strategy: ${resolution.strategy}`, 'INVALID_STRATEGY');
            }

            // Update conflict status
            conflict.resolution = {
                proposed: resolution.strategy,
                status: 'resolved',
                resolvedBy: userId,
                resolvedAt: new Date()
            };

            await availability.save({ session });

            // Send resolution notifications
            await this.#sendConflictResolutionNotifications(availability, conflict, resolution, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'CONFLICT_RESOLVED',
                entityType: 'consultant_availability',
                entityId: availability._id,
                userId,
                details: {
                    conflictId,
                    consultantId,
                    strategy: resolution.strategy
                }
            });

            return {
                resolved: true,
                conflict,
                resolution
            };
        } catch (error) {
            logger.error('Error resolving conflict', {
                error: error.message,
                consultantId,
                conflictId
            });
            throw error;
        }
    }

    // ==================== Analytics & Reporting ====================

    /**
     * Generate utilization report
     * @param {Object} filters - Report filters
     * @param {Object} options - Report options
     * @returns {Promise<Object>} Utilization report
     */
    async generateUtilizationReport(filters = {}, options = {}) {
        const {
            tenantId,
            startDate = moment().startOf('month').toDate(),
            endDate = moment().endOf('month').toDate(),
            groupBy = 'consultant'
        } = options;

        try {
            // Get availability data
            const query = { isDeleted: false };
            if (tenantId) query.tenantId = tenantId;
            if (filters.consultantIds) query.consultantId = { $in: filters.consultantIds };

            const availabilities = await ConsultantAvailabilityModel.find(query)
                .populate('consultantId');

            // Calculate utilization metrics
            const report = {
                period: { start: startDate, end: endDate },
                summary: {
                    totalConsultants: availabilities.length,
                    averageUtilization: 0,
                    totalCapacityHours: 0,
                    totalAllocatedHours: 0,
                    totalAvailableHours: 0
                },
                details: [],
                analytics: {}
            };

            // Process each consultant
            for (const availability of availabilities) {
                const metrics = await this.#calculateUtilizationMetrics(availability, startDate, endDate);
                
                report.details.push({
                    consultantId: availability.consultantId._id,
                    consultantName: availability.consultantId.fullName,
                    level: availability.consultantId.profile.level,
                    ...metrics
                });

                report.summary.totalCapacityHours += metrics.capacityHours;
                report.summary.totalAllocatedHours += metrics.allocatedHours;
                report.summary.totalAvailableHours += metrics.availableHours;
            }

            // Calculate summary metrics
            report.summary.averageUtilization = report.summary.totalCapacityHours > 0
                ? (report.summary.totalAllocatedHours / report.summary.totalCapacityHours) * 100
                : 0;

            // Add analytics
            report.analytics = await this.#generateUtilizationAnalytics(report.details, options);

            // Group results if requested
            if (groupBy !== 'consultant') {
                report.grouped = await this.#groupUtilizationResults(report.details, groupBy);
            }

            return report;
        } catch (error) {
            logger.error('Error generating utilization report', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    /**
     * Forecast availability
     * @param {Object} requirements - Forecast requirements
     * @param {Object} options - Forecast options
     * @returns {Promise<Object>} Availability forecast
     */
    async forecastAvailability(requirements = {}, options = {}) {
        const {
            tenantId,
            forecastPeriod = 90, // days
            skills = [],
            minAvailability = 50
        } = requirements;

        try {
            const startDate = new Date();
            const endDate = moment().add(forecastPeriod, 'days').toDate();

            // Get consultants with required skills
            const consultants = await this.#getConsultantsWithSkills(skills, tenantId);

            const forecast = {
                period: { start: startDate, end: endDate },
                requirements,
                availability: [],
                recommendations: []
            };

            // Forecast availability for each consultant
            for (const consultant of consultants) {
                const availability = await ConsultantAvailabilityModel.findOne({
                    consultantId: consultant._id,
                    isDeleted: false
                });

                if (availability) {
                    const consultantForecast = await this.#forecastConsultantAvailability(
                        availability,
                        startDate,
                        endDate
                    );

                    if (consultantForecast.averageAvailability >= minAvailability) {
                        forecast.availability.push({
                            consultantId: consultant._id,
                            consultantName: consultant.fullName,
                            ...consultantForecast
                        });
                    }
                }
            }

            // Sort by availability
            forecast.availability.sort((a, b) => b.averageAvailability - a.averageAvailability);

            // Generate recommendations
            forecast.recommendations = await this.#generateAvailabilityRecommendations(forecast);

            return forecast;
        } catch (error) {
            logger.error('Error forecasting availability', {
                error: error.message,
                requirements
            });
            throw error;
        }
    }

    // ==================== Private Helper Methods ====================

    /**
     * Start periodic tasks
     * @private
     */
    #startPeriodicTasks() {
        // Update utilization cache every 15 minutes
        setInterval(() => {
            this.#updateUtilizationCache();
        }, 15 * 60 * 1000);

        // Check for expired bookings daily
        setInterval(() => {
            this.#checkExpiredBookings();
        }, 24 * 60 * 60 * 1000);
    }

    /**
     * Validate availability data
     * @private
     */
    async #validateAvailabilityData(availabilityData) {
        const errors = [];

        if (availabilityData.hoursPerDay && (availabilityData.hoursPerDay < 1 || availabilityData.hoursPerDay > 24)) {
            errors.push('Hours per day must be between 1 and 24');
        }

        if (availabilityData.daysPerWeek && (availabilityData.daysPerWeek < 1 || availabilityData.daysPerWeek > 7)) {
            errors.push('Days per week must be between 1 and 7');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Generate default working hours
     * @private
     */
    #generateDefaultWorkingHours(customHours = {}) {
        const defaultHours = {
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

        return { ...defaultHours, ...customHours };
    }

    /**
     * Initialize calendar
     * @private
     */
    async #initializeCalendar(availability, session) {
        const startDate = new Date();
        const endDate = moment().add(3, 'months').toDate();
        const calendar = [];

        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const dayOfWeek = date.getDay();
            const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];
            const workingHours = availability.schedule.workingHours.regular[dayName];

            calendar.push({
                date: new Date(date),
                dayType: workingHours.isWorking ? 'working' : 'weekend',
                availability: {
                    morning: workingHours.isWorking ? 'available' : 'blocked',
                    afternoon: workingHours.isWorking ? 'available' : 'blocked',
                    evening: 'blocked'
                },
                allocations: [],
                totalHours: workingHours.isWorking ? 8 : 0,
                availableHours: workingHours.isWorking ? 8 : 0,
                utilization: 0
            });
        }

        availability.schedule.calendar = calendar;
        await availability.save({ session });
    }

    /**
     * Sync with external calendar
     * @private
     */
    async #syncExternalCalendar(availability, externalCalendar) {
        try {
            await this.#calendarService.syncCalendar({
                provider: externalCalendar.provider,
                accountId: externalCalendar.accountId,
                syncDirection: externalCalendar.syncDirection || 'two_way'
            });
        } catch (error) {
            logger.error('Failed to sync external calendar', {
                availabilityId: availability.availabilityId,
                error: error.message
            });
        }
    }

    /**
     * Send availability notifications
     * @private
     */
    async #sendAvailabilityNotifications(consultant, availability, action, userId) {
        await this.#notificationService.send({
            type: `availability_${action}`,
            recipient: consultant._id,
            data: {
                availabilityId: availability.availabilityId,
                action,
                performedBy: userId
            }
        });
    }

    /**
     * Get calendar for date range
     * @private
     */
    async #getCalendarForRange(availability, startDate, endDate) {
        return availability.schedule.calendar.filter(day => 
            day.date >= startDate && day.date <= endDate
        );
    }

    /**
     * Get bookings for date range
     * @private
     */
    async #getBookingsForRange(consultantId, startDate, endDate) {
        const availability = await ConsultantAvailabilityModel.findOne({ consultantId });
        if (!availability) return [];

        return availability.allocations.current.filter(allocation => 
            allocation.period.start <= endDate && allocation.period.end >= startDate
        );
    }

    /**
     * Get conflicts for date range
     * @private
     */
    async #getConflictsForRange(availability, startDate, endDate) {
        return availability.conflicts.scheduling.filter(conflict =>
            conflict.period.start <= endDate && conflict.period.end >= startDate
        );
    }

    /**
     * Calculate utilization for date range
     * @private
     */
    async #calculateUtilizationForRange(availability, startDate, endDate) {
        const workingDays = availability.getWorkingDaysInPeriod(startDate, endDate);
        const totalHours = workingDays * availability.capacity.standard.hoursPerDay;
        
        let allocatedHours = 0;
        availability.allocations.current.forEach(allocation => {
            if (allocation.period.start <= endDate && allocation.period.end >= startDate) {
                const overlapStart = Math.max(allocation.period.start, startDate);
                const overlapEnd = Math.min(allocation.period.end, endDate);
                const overlapDays = availability.getWorkingDaysInPeriod(overlapStart, overlapEnd);
                allocatedHours += overlapDays * (allocation.allocation.hoursPerDay || 0);
            }
        });

        return {
            totalHours,
            allocatedHours,
            availableHours: totalHours - allocatedHours,
            utilizationPercentage: totalHours > 0 ? (allocatedHours / totalHours) * 100 : 0
        };
    }

    /**
     * Format availability response
     * @private
     */
    #formatAvailabilityResponse(response, format) {
        switch (format) {
            case 'summary':
                return {
                    consultantId: response.consultantId,
                    status: response.currentStatus.status,
                    utilization: response.utilization?.utilizationPercentage
                };
            case 'calendar':
                return response.calendar;
            default:
                return response;
        }
    }

    /**
     * Validate schedule update
     * @private
     */
    async #validateScheduleUpdate(scheduleUpdate) {
        const errors = [];

        if (!scheduleUpdate.type) {
            errors.push('Schedule update type is required');
        }

        if (scheduleUpdate.type === 'time_off' && !scheduleUpdate.period) {
            errors.push('Time off period is required');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Check schedule update conflicts
     * @private
     */
    async #checkScheduleUpdateConflicts(availability, scheduleUpdate) {
        const conflicts = [];

        // Check for conflicting bookings
        availability.allocations.current.forEach(allocation => {
            if (this.#periodsOverlap(allocation.period, scheduleUpdate.period)) {
                conflicts.push({
                    type: 'booking_conflict',
                    allocation
                });
            }
        });

        return conflicts;
    }

    /**
     * Update working hours
     * @private
     */
    async #updateWorkingHours(availability, scheduleUpdate, session) {
        Object.assign(availability.schedule.workingHours, scheduleUpdate.workingHours);
        await availability.save({ session });
    }

    /**
     * Add time off
     * @private
     */
    async #addTimeOff(availability, scheduleUpdate, userId, session) {
        availability.timeOff.requests.push({
            requestId: mongoose.Types.ObjectId().toString(),
            type: scheduleUpdate.timeOffType,
            period: scheduleUpdate.period,
            reason: scheduleUpdate.reason,
            status: 'approved',
            requestedAt: new Date(),
            approvedBy: userId,
            approvedAt: new Date()
        });
        await availability.save({ session });
    }

    /**
     * Add recurring commitment
     * @private
     */
    async #addRecurringCommitment(availability, scheduleUpdate, session) {
        availability.schedule.recurringCommitments.push(scheduleUpdate.commitment);
        await availability.save({ session });
    }

    /**
     * Add schedule exception
     * @private
     */
    async #addScheduleException(availability, scheduleUpdate, session) {
        availability.schedule.workingHours.exceptions.push(scheduleUpdate.exception);
        await availability.save({ session });
    }

    /**
     * Regenerate calendar
     * @private
     */
    async #regenerateCalendar(availability, affectedDates) {
        // Regenerate calendar for affected dates
        for (const date of affectedDates || []) {
            const calendarEntry = availability.schedule.calendar.find(
                c => c.date.toDateString() === date.toDateString()
            );
            if (calendarEntry) {
                // Update calendar entry based on new schedule
                calendarEntry.availableHours = this.#calculateAvailableHoursForDate(availability, date);
            }
        }
    }

    /**
     * Resolve schedule conflicts
     * @private
     */
    async #resolveScheduleConflicts(availability, conflicts, userId) {
        for (const conflict of conflicts) {
            // Send conflict notifications
            await this.#notificationService.send({
                type: 'schedule_conflict',
                recipient: userId,
                data: { conflict }
            });
        }
    }

    /**
     * Send schedule update notifications
     * @private
     */
    async #sendScheduleUpdateNotifications(availability, scheduleUpdate, userId) {
        await this.#notificationService.send({
            type: 'schedule_updated',
            recipient: availability.consultantId,
            data: {
                updateType: scheduleUpdate.type,
                updatedBy: userId
            }
        });
    }

    /**
     * Validate booking data
     * @private
     */
    async #validateBookingData(bookingData) {
        const errors = [];

        if (!bookingData.period?.start || !bookingData.period?.end) {
            errors.push('Booking period is required');
        }

        if (bookingData.allocation && (bookingData.allocation.percentage < 0 || bookingData.allocation.percentage > 100)) {
            errors.push('Allocation percentage must be between 0 and 100');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Check availability for booking
     * @private
     */
    async #checkAvailabilityForBooking(availability, bookingData) {
        const consultant = await ConsultantModel.findById(availability.consultantId);
        
        return consultant.checkAvailability(
            bookingData.period.start,
            bookingData.period.end,
            bookingData.allocation?.percentage || 100
        );
    }

    /**
     * Check booking conflicts
     * @private
     */
    async #checkBookingConflicts(availability, bookingData) {
        const conflicts = [];

        availability.allocations.current.forEach(allocation => {
            if (this.#periodsOverlap(allocation.period, bookingData.period)) {
                const totalAllocation = (allocation.allocation?.percentage || 0) + 
                                      (bookingData.allocation?.percentage || 100);
                
                if (totalAllocation > 100) {
                    conflicts.push({
                        type: 'overallocation',
                        existing: allocation,
                        requested: bookingData,
                        totalAllocation
                    });
                }
            }
        });

        return conflicts;
    }

    /**
     * Resolve booking conflicts
     * @private
     */
    async #resolveBookingConflicts(conflicts, bookingData, options) {
        const priority = this.#bookingPriorities[bookingData.priority || 'medium'];
        
        if (priority.canOverride && options.overrideConflicts) {
            return { canProceed: true, resolution: 'override' };
        }

        return { canProceed: false };
    }

    /**
     * Update calendar with booking
     * @private
     */
    async #updateCalendarWithBooking(availability, booking) {
        const startDate = new Date(booking.period.start);
        const endDate = new Date(booking.period.end);

        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const calendarEntry = availability.schedule.calendar.find(
                c => c.date.toDateString() === date.toDateString()
            );

            if (calendarEntry) {
                calendarEntry.allocations.push({
                    projectId: booking.projectId,
                    hours: booking.allocation.hoursPerDay || 8,
                    type: booking.type,
                    status: booking.status
                });

                calendarEntry.availableHours = Math.max(
                    0,
                    calendarEntry.totalHours - calendarEntry.allocations.reduce((sum, a) => sum + a.hours, 0)
                );

                calendarEntry.utilization = calendarEntry.totalHours > 0
                    ? (calendarEntry.allocations.reduce((sum, a) => sum + a.hours, 0) / calendarEntry.totalHours) * 100
                    : 0;
            }
        }

        await availability.save();
    }

    /**
     * Sync booking to external calendars
     * @private
     */
    async #syncBookingToExternalCalendars(availability, booking) {
        for (const calendar of availability.integration.externalCalendars) {
            if (calendar.syncEnabled) {
                try {
                    await this.#calendarService.createEvent({
                        provider: calendar.provider,
                        accountId: calendar.accountId,
                        event: {
                            title: `Project: ${booking.projectId}`,
                            start: booking.period.start,
                            end: booking.period.end,
                            description: booking.notes
                        }
                    });
                } catch (error) {
                    logger.error('Failed to sync booking to external calendar', {
                        bookingId: booking.allocationId,
                        provider: calendar.provider,
                        error: error.message
                    });
                }
            }
        }
    }

    /**
     * Send booking notifications
     * @private
     */
    async #sendBookingNotifications(availability, booking, action, userId) {
        await this.#notificationService.send({
            type: `booking_${action}`,
            recipient: availability.consultantId,
            data: {
                bookingId: booking.allocationId,
                projectId: booking.projectId,
                period: booking.period,
                action,
                performedBy: userId
            }
        });
    }

    /**
     * Schedule booking reminders
     * @private
     */
    async #scheduleBookingReminders(booking, consultantId) {
        const reminderDates = [
            moment(booking.period.start).subtract(1, 'week').toDate(),
            moment(booking.period.start).subtract(1, 'day').toDate()
        ];

        for (const reminderDate of reminderDates) {
            if (reminderDate > new Date()) {
                await this.#notificationService.scheduleNotification({
                    type: 'booking_reminder',
                    recipient: consultantId,
                    scheduledFor: reminderDate,
                    data: {
                        bookingId: booking.allocationId,
                        projectId: booking.projectId,
                        startDate: booking.period.start
                    }
                });
            }
        }
    }

    /**
     * All remaining private helper methods
     * @private
     */

    #calculateTotalHours(availability, startDate, endDate) {
        const workingDays = availability.getWorkingDaysInPeriod(startDate, endDate);
        return workingDays * availability.capacity.standard.hoursPerDay;
    }

    #calculateAvailableHours(availability, startDate, endDate) {
        const totalHours = this.#calculateTotalHours(availability, startDate, endDate);
        const allocatedHours = this.#calculateAllocatedHours(availability, startDate, endDate);
        return Math.max(0, totalHours - allocatedHours);
    }

    #calculateAllocatedHours(availability, startDate, endDate) {
        let allocatedHours = 0;
        
        availability.allocations.current.forEach(allocation => {
            if (this.#periodsOverlap(allocation.period, { start: startDate, end: endDate })) {
                const overlapDays = this.#calculateOverlapDays(allocation.period, { start: startDate, end: endDate });
                allocatedHours += overlapDays * (allocation.allocation?.hoursPerDay || 8);
            }
        });

        return allocatedHours;
    }

    #calculateAvailableHoursForDate(availability, date) {
        const dayOfWeek = date.getDay();
        const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];
        const workingHours = availability.schedule.workingHours.regular[dayName];
        return workingHours.isWorking ? 8 : 0;
    }

    #periodsOverlap(period1, period2) {
        return period1.start <= period2.end && period1.end >= period2.start;
    }

    #calculateOverlapDays(period1, period2) {
        const overlapStart = Math.max(period1.start, period2.start);
        const overlapEnd = Math.min(period1.end, period2.end);
        const days = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24));
        return Math.max(0, days);
    }

    async #forecastCapacity(availability, startDate, endDate) {
        return {
            trend: 'stable',
            predictedUtilization: availability.capacity.current?.utilization?.current || 0,
            confidence: 0.75
        };
    }

    async #generateCapacityRecommendations(capacity, availability) {
        const recommendations = [];

        if (capacity.current.utilization > 90) {
            recommendations.push({
                type: 'overutilization',
                message: 'Consultant is overutilized',
                action: 'Consider redistributing workload'
            });
        } else if (capacity.current.utilization < 50) {
            recommendations.push({
                type: 'underutilization',
                message: 'Consultant is underutilized',
                action: 'Assign additional projects'
            });
        }

        return recommendations;
    }

    async #identifyCapacityIssues(capacity, availability) {
        const issues = [];

        if (capacity.current.allocatedHours > capacity.current.totalHours) {
            issues.push({
                type: 'overallocation',
                severity: 'high',
                message: 'Allocated hours exceed total capacity'
            });
        }

        return issues;
    }

    async #generateOptimizationRecommendations(results, options) {
        const recommendations = [];

        if (results.underutilized.length > 0) {
            recommendations.push({
                type: 'reassignment',
                message: `${results.underutilized.length} consultants are underutilized`,
                action: 'Consider reassigning work from overutilized consultants'
            });
        }

        return recommendations;
    }

    async #calculatePotentialImprovements(results) {
        const totalGap = results.underutilized.reduce((sum, c) => sum + Math.abs(c.gap), 0) +
                        results.overutilized.reduce((sum, c) => sum + Math.abs(c.gap), 0);
        
        return {
            utilizationImprovement: totalGap / (results.underutilized.length + results.overutilized.length),
            potentialHoursSaved: totalGap * 40 // Assuming 40 hours per week
        };
    }

    async #generateResolutionOptions(conflict, availability) {
        return [
            { strategy: 'reschedule', description: 'Reschedule conflicting bookings' },
            { strategy: 'reassign', description: 'Reassign to another consultant' },
            { strategy: 'split', description: 'Split allocation between consultants' }
        ];
    }

    async #rescheduleConflictingBookings(availability, conflict, resolution, session) {
        // Implementation for rescheduling
        return true;
    }

    async #reassignConflictingBookings(availability, conflict, resolution, session) {
        // Implementation for reassigning
        return true;
    }

    async #splitConflictingBookings(availability, conflict, resolution, session) {
        // Implementation for splitting
        return true;
    }

    async #overrideConflict(availability, conflict, resolution, session) {
        // Implementation for overriding
        return true;
    }

    async #sendConflictResolutionNotifications(availability, conflict, resolution, userId) {
        await this.#notificationService.send({
            type: 'conflict_resolved',
            recipient: availability.consultantId,
            data: { conflict, resolution }
        });
    }

    async #calculateUtilizationMetrics(availability, startDate, endDate) {
        const capacityHours = this.#calculateTotalHours(availability, startDate, endDate);
        const allocatedHours = this.#calculateAllocatedHours(availability, startDate, endDate);
        const availableHours = capacityHours - allocatedHours;

        return {
            capacityHours,
            allocatedHours,
            availableHours,
            utilization: capacityHours > 0 ? (allocatedHours / capacityHours) * 100 : 0
        };
    }

    async #generateUtilizationAnalytics(details, options) {
        return {
            distribution: this.#calculateUtilizationDistribution(details),
            trends: this.#calculateUtilizationTrends(details)
        };
    }

    #calculateUtilizationDistribution(details) {
        const distribution = {
            '0-25%': 0,
            '25-50%': 0,
            '50-75%': 0,
            '75-100%': 0,
            '>100%': 0
        };

        details.forEach(d => {
            if (d.utilization > 100) distribution['>100%']++;
            else if (d.utilization > 75) distribution['75-100%']++;
            else if (d.utilization > 50) distribution['50-75%']++;
            else if (d.utilization > 25) distribution['25-50%']++;
            else distribution['0-25%']++;
        });

        return distribution;
    }

    #calculateUtilizationTrends(details) {
        // Simple trend calculation
        return { trend: 'stable', change: 0 };
    }

    async #groupUtilizationResults(details, groupBy) {
        const grouped = {};

        details.forEach(detail => {
            const key = detail[groupBy] || 'unknown';
            if (!grouped[key]) {
                grouped[key] = {
                    count: 0,
                    totalUtilization: 0,
                    averageUtilization: 0
                };
            }
            grouped[key].count++;
            grouped[key].totalUtilization += detail.utilization;
        });

        Object.keys(grouped).forEach(key => {
            grouped[key].averageUtilization = grouped[key].totalUtilization / grouped[key].count;
        });

        return grouped;
    }

    async #getConsultantsWithSkills(skills, tenantId) {
        if (!skills || skills.length === 0) {
            return ConsultantModel.find({ tenantId, isDeleted: false });
        }
        
        return ConsultantModel.find({
            tenantId,
            isDeleted: false,
            'skills.technical.name': { $in: skills }
        });
    }

    async #forecastConsultantAvailability(availability, startDate, endDate) {
        const utilization = await this.#calculateUtilizationForRange(availability, startDate, endDate);
        
        return {
            averageAvailability: 100 - utilization.utilizationPercentage,
            periods: []
        };
    }

    async #generateAvailabilityRecommendations(forecast) {
        const recommendations = [];

        if (forecast.availability.length < 3) {
            recommendations.push({
                type: 'capacity',
                message: 'Limited consultants available for requirements',
                action: 'Consider expanding search criteria or timeline'
            });
        }

        return recommendations;
    }

    async #updateUtilizationCache() {
        // Periodic cache update implementation
        logger.info('Updating utilization cache');
    }

    async #checkExpiredBookings() {
        // Check and handle expired bookings
        logger.info('Checking for expired bookings');
    }

    async #validateBookingUpdate(updateData, booking) {
        // Validate booking update data
        return true;
    }

    async #checkBookingUpdateConflicts(availability, booking, updateData) {
        // Check for conflicts with booking update
        return [];
    }

    async #removeBookingFromCalendar(availability, booking) {
        // Remove booking from calendar
        return true;
    }

    async #validateCancellationPolicy(booking, cancellationData) {
        // Validate cancellation against policy
        return true;
    }

    #generateCacheKey(type, identifier, options = {}) {
        const optionsHash = crypto
            .createHash('md5')
            .update(JSON.stringify(options))
            .digest('hex');
        return `availability:${type}:${identifier}:${optionsHash}`;
    }

    async #clearAvailabilityCaches(tenantId, consultantId = null) {
        const patterns = [`availability:*:${tenantId}:*`];
        if (consultantId) {
            patterns.push(`availability:*:${consultantId}:*`);
        }

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }
}

module.exports = ConsultantAvailabilityService;