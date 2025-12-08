/**
 * @fileoverview Consultant Availability Management Service
 * @module servers/customer-services/modules/core-business/consultant-management/services/consultant-availability-service
 * @description Comprehensive service for managing consultant availability, time-off requests, 
 * scheduling windows, capacity tracking, and resource planning
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-availability-service'
});
const crypto = require('crypto');
const mongoose = require('mongoose');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import related services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');

/**
 * Availability Type Constants
 */
const AVAILABILITY_TYPES = {
    REGULAR: 'regular',
    EXCEPTION: 'exception',
    TIME_OFF: 'time_off',
    HOLIDAY: 'holiday',
    BLACKOUT: 'blackout',
    OVERRIDE: 'override',
    TRAINING: 'training',
    INTERNAL: 'internal'
};

/**
 * Availability Status Constants
 */
const AVAILABILITY_STATUS = {
    AVAILABLE: 'available',
    PARTIALLY_AVAILABLE: 'partially_available',
    UNAVAILABLE: 'unavailable',
    TENTATIVE: 'tentative',
    PENDING_APPROVAL: 'pending_approval'
};

/**
 * Time Off Reason Constants
 */
const TIME_OFF_REASONS = {
    VACATION: 'vacation',
    SICK: 'sick',
    PERSONAL: 'personal',
    BEREAVEMENT: 'bereavement',
    PARENTAL: 'parental',
    JURY_DUTY: 'jury_duty',
    MILITARY: 'military',
    SABBATICAL: 'sabbatical',
    TRAINING: 'training',
    CONFERENCE: 'conference',
    PUBLIC_HOLIDAY: 'public_holiday',
    COMPANY_HOLIDAY: 'company_holiday',
    OTHER: 'other'
};

/**
 * Approval Status Constants
 */
const APPROVAL_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    AUTO_APPROVED: 'auto_approved'
};

/**
 * Recurrence Pattern Constants
 */
const RECURRENCE_PATTERNS = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    BI_WEEKLY: 'bi_weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
    CUSTOM: 'custom'
};

/**
 * Consultant Availability Service
 * Manages all aspects of consultant availability including scheduling, time-off, and capacity planning
 * @class ConsultantAvailabilityService
 */
class ConsultantAvailabilityService {
    constructor() {
        this._dbService = null;
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            defaultTimezone: process.env.DEFAULT_TIMEZONE || 'UTC',
            defaultWorkHoursPerDay: parseInt(process.env.DEFAULT_WORK_HOURS_PER_DAY, 10) || 8,
            defaultWorkDaysPerWeek: parseInt(process.env.DEFAULT_WORK_DAYS_PER_WEEK, 10) || 5,
            autoApproveTimeOffDays: parseInt(process.env.AUTO_APPROVE_TIME_OFF_DAYS, 10) || 2,
            maxTimeOffDaysPerRequest: parseInt(process.env.MAX_TIME_OFF_DAYS_PER_REQUEST, 10) || 30,
            advanceNoticeRequired: parseInt(process.env.TIME_OFF_ADVANCE_NOTICE_DAYS, 10) || 14,
            maxLookAheadDays: parseInt(process.env.MAX_AVAILABILITY_LOOK_AHEAD_DAYS, 10) || 365,
            conflictCheckEnabled: process.env.AVAILABILITY_CONFLICT_CHECK !== 'false'
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

    // ============= AVAILABILITY RECORD CREATION =============

    /**
     * Create a new availability record
     * @param {string} consultantId - Consultant ID
     * @param {Object} availabilityData - Availability information
     * @param {string} availabilityData.type - Type of availability record (regular, exception, time_off, etc.)
     * @param {Object} availabilityData.period - Time period with startDate, endDate, startTime, endTime
     * @param {Object} availabilityData.capacity - Capacity details (hoursAvailable, percentageAvailable)
     * @param {Object} availabilityData.timeOff - Time-off specific details (for time_off type)
     * @param {Object} options - Additional options
     * @param {string} options.tenantId - Tenant ID for multi-tenancy
     * @param {string} options.userId - User ID of the creator
     * @param {boolean} options.skipConflictCheck - Skip conflict detection
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Created availability record
     */
    async createAvailability(consultantId, availabilityData, options = {}) {
        try {
            logger.info('Creating availability record', {
                consultantId,
                type: availabilityData.type,
                startDate: availabilityData.period?.startDate,
                endDate: availabilityData.period?.endDate
            });

            // Validate availability data
            await this._validateAvailabilityData(availabilityData);

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Verify consultant exists
            const consultant = await Consultant.findById(consultantId);
            if (!consultant) {
                throw AppError.notFound('Consultant not found', { context: { consultantId } });
            }

            // Check tenant access
            if (options.tenantId && !options.skipTenantCheck && 
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Check for conflicts if enabled
            if (this.config.conflictCheckEnabled && !options.skipConflictCheck) {
                const conflicts = await this._checkAvailabilityConflicts(
                    consultantId,
                    availabilityData.period.startDate,
                    availabilityData.period.endDate,
                    availabilityData.type
                );

                if (conflicts.length > 0) {
                    throw AppError.conflict('Availability conflicts detected', {
                        context: { conflicts: conflicts.map(c => ({
                            availabilityId: c.availabilityId,
                            type: c.type,
                            period: c.period
                        }))}
                    });
                }
            }

            // Generate availability ID
            const availabilityId = this._generateAvailabilityId();

            // Determine initial approval status for time-off
            let approvalStatus = null;
            if (availabilityData.type === AVAILABILITY_TYPES.TIME_OFF) {
                approvalStatus = await this._determineApprovalStatus(availabilityData, consultant, options);
            }

            // Build availability record
            const availabilityRecord = new ConsultantAvailability({
                availabilityId,
                tenantId: consultant.tenantId,
                organizationId: consultant.organizationId,
                consultantId,
                type: availabilityData.type,
                period: {
                    startDate: new Date(availabilityData.period.startDate),
                    endDate: new Date(availabilityData.period.endDate),
                    startTime: availabilityData.period.startTime,
                    endTime: availabilityData.period.endTime,
                    timezone: availabilityData.period.timezone || this.config.defaultTimezone,
                    allDay: availabilityData.period.allDay || false
                },
                recurrence: availabilityData.recurrence || {
                    isRecurring: false
                },
                capacity: {
                    hoursAvailable: availabilityData.capacity?.hoursAvailable ?? this.config.defaultWorkHoursPerDay,
                    percentageAvailable: availabilityData.capacity?.percentageAvailable ?? 100,
                    maxProjects: availabilityData.capacity?.maxProjects,
                    maxClients: availabilityData.capacity?.maxClients,
                    preferredHoursPerDay: availabilityData.capacity?.preferredHoursPerDay,
                    billableTarget: availabilityData.capacity?.billableTarget
                },
                availabilityStatus: this._determineAvailabilityStatus(availabilityData),
                timeOff: availabilityData.type === AVAILABILITY_TYPES.TIME_OFF ? {
                    reason: availabilityData.timeOff?.reason || TIME_OFF_REASONS.OTHER,
                    description: availabilityData.timeOff?.description,
                    isPaid: availabilityData.timeOff?.isPaid ?? true,
                    hoursUsed: this._calculateHoursUsed(availabilityData.period),
                    approvalStatus: approvalStatus || APPROVAL_STATUS.PENDING,
                    requestedAt: new Date(),
                    attachments: availabilityData.timeOff?.attachments || []
                } : undefined,
                preferences: availabilityData.preferences || {},
                notifications: {
                    notifyManager: availabilityData.notifications?.notifyManager ?? true,
                    notifyTeam: availabilityData.notifications?.notifyTeam ?? false,
                    reminders: availabilityData.notifications?.reminders || []
                },
                conflicts: [],
                status: {
                    current: 'active',
                    isActive: true,
                    isDeleted: false
                },
                metadata: {
                    createdBy: options.userId,
                    notes: availabilityData.metadata?.notes,
                    tags: availabilityData.metadata?.tags || []
                }
            });

            await availabilityRecord.save();

            // Update consultant's availability summary if applicable
            await this._updateConsultantAvailabilitySummary(consultantId);

            // Handle post-creation workflows
            await this._handlePostAvailabilityCreation(availabilityRecord, consultant, options);

            logger.info('Availability record created successfully', {
                consultantId,
                availabilityId,
                type: availabilityData.type
            });

            return this._sanitizeAvailabilityOutput(availabilityRecord);

        } catch (error) {
            logger.error('Failed to create availability record', {
                error: error.message,
                stack: error.stack,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Create time-off request
     * @param {string} consultantId - Consultant ID
     * @param {Object} timeOffData - Time-off request information
     * @param {Date} timeOffData.startDate - Start date of time off
     * @param {Date} timeOffData.endDate - End date of time off
     * @param {string} timeOffData.reason - Reason for time off
     * @param {string} timeOffData.description - Detailed description
     * @param {boolean} timeOffData.isPaid - Whether time off is paid
     * @param {Object} options - Additional options
     * @param {string} options.tenantId - Tenant ID for multi-tenancy
     * @param {string} options.userId - User ID of the requestor
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Created time-off request
     */
    async createTimeOffRequest(consultantId, timeOffData, options = {}) {
        try {
            logger.info('Creating time-off request', {
                consultantId,
                reason: timeOffData.reason,
                startDate: timeOffData.startDate,
                endDate: timeOffData.endDate
            });

            // Validate time-off specific rules
            await this._validateTimeOffRequest(timeOffData);

            // Build availability data for time-off
            const availabilityData = {
                type: AVAILABILITY_TYPES.TIME_OFF,
                period: {
                    startDate: timeOffData.startDate,
                    endDate: timeOffData.endDate,
                    startTime: timeOffData.startTime,
                    endTime: timeOffData.endTime,
                    timezone: timeOffData.timezone || this.config.defaultTimezone,
                    allDay: timeOffData.allDay ?? true
                },
                capacity: {
                    hoursAvailable: 0,
                    percentageAvailable: 0
                },
                timeOff: {
                    reason: timeOffData.reason,
                    description: timeOffData.description,
                    isPaid: timeOffData.isPaid ?? true,
                    attachments: timeOffData.attachments || []
                },
                notifications: {
                    notifyManager: true,
                    notifyTeam: timeOffData.notifyTeam ?? false
                },
                metadata: {
                    notes: timeOffData.notes,
                    tags: ['time-off-request']
                }
            };

            return this.createAvailability(consultantId, availabilityData, options);

        } catch (error) {
            logger.error('Failed to create time-off request', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Bulk create availability records
     * @param {string} consultantId - Consultant ID
     * @param {Array<Object>} availabilityRecords - Array of availability data objects
     * @param {Object} options - Additional options
     * @param {string} options.tenantId - Tenant ID for multi-tenancy
     * @param {string} options.userId - User ID of the creator
     * @param {boolean} options.skipConflictCheck - Skip conflict detection
     * @returns {Promise<Object>} Result with created records and any errors
     */
    async bulkCreateAvailability(consultantId, availabilityRecords, options = {}) {
        try {
            logger.info('Bulk creating availability records', {
                consultantId,
                count: availabilityRecords.length
            });

            const results = {
                created: [],
                failed: [],
                skipped: []
            };

            for (const availabilityData of availabilityRecords) {
                try {
                    const record = await this.createAvailability(consultantId, availabilityData, {
                        ...options,
                        skipConflictCheck: options.skipConflictCheck
                    });
                    results.created.push(record);
                } catch (error) {
                    if (error.code === 'CONFLICT') {
                        results.skipped.push({
                            period: availabilityData.period,
                            reason: 'Conflict detected'
                        });
                    } else {
                        results.failed.push({
                            period: availabilityData.period,
                            error: error.message
                        });
                    }
                }
            }

            // Update consultant availability summary once after all records
            if (results.created.length > 0) {
                await this._updateConsultantAvailabilitySummary(consultantId);
            }

            logger.info('Bulk availability creation completed', {
                consultantId,
                created: results.created.length,
                failed: results.failed.length,
                skipped: results.skipped.length
            });

            return results;

        } catch (error) {
            logger.error('Bulk availability creation failed', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============= AVAILABILITY RETRIEVAL =============

    /**
     * Get availability record by ID
     * @param {string} availabilityId - Availability record ID (MongoDB _id or availabilityId)
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {boolean} options.skipTenantCheck - Skip tenant verification
     * @param {boolean} options.includeConsultant - Populate consultant details
     * @returns {Promise<Object>} Availability record
     */
    async getAvailabilityById(availabilityId, options = {}) {
        try {
            logger.info('Fetching availability by ID', { availabilityId });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            // Try finding by MongoDB _id first, then by availabilityId
            let query;
            if (mongoose.Types.ObjectId.isValid(availabilityId)) {
                query = ConsultantAvailability.findById(availabilityId);
            } else {
                query = ConsultantAvailability.findOne({ availabilityId: availabilityId.toUpperCase() });
            }

            if (options.includeConsultant) {
                query = query.populate('consultantId', 'profile.firstName profile.lastName consultantCode professional.level');
            }

            const availability = await query.exec();

            if (!availability) {
                throw AppError.notFound('Availability record not found', {
                    context: { availabilityId }
                });
            }

            // Check tenant access
            if (options.tenantId && !options.skipTenantCheck &&
                availability.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this availability record');
            }

            return this._sanitizeAvailabilityOutput(availability);

        } catch (error) {
            logger.error('Failed to fetch availability', {
                error: error.message,
                availabilityId
            });
            throw error;
        }
    }

    /**
     * Get all availability records for a consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {Date} options.startDate - Filter by start date (availability ending after this date)
     * @param {Date} options.endDate - Filter by end date (availability starting before this date)
     * @param {string} options.type - Filter by availability type
     * @param {string} options.status - Filter by availability status
     * @param {string} options.approvalStatus - Filter by approval status (for time-off)
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {number} options.limit - Maximum number of records to return
     * @param {number} options.skip - Number of records to skip for pagination
     * @param {string} options.sortBy - Field to sort by
     * @param {string} options.sortOrder - Sort order (asc/desc)
     * @returns {Promise<Object>} Paginated availability records
     */
    async getConsultantAvailability(consultantId, options = {}) {
        try {
            logger.info('Fetching consultant availability', {
                consultantId,
                startDate: options.startDate,
                endDate: options.endDate,
                type: options.type
            });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            // Build query
            const query = {
                consultantId: new mongoose.Types.ObjectId(consultantId),
                'status.isDeleted': false
            };

            // Apply filters
            if (options.tenantId) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.type) {
                query.type = options.type;
            }

            if (options.status) {
                query.availabilityStatus = options.status;
            }

            if (options.approvalStatus) {
                query['timeOff.approvalStatus'] = options.approvalStatus;
            }

            // Date range filtering
            if (options.startDate || options.endDate) {
                if (options.startDate && options.endDate) {
                    // Overlapping records
                    query['period.startDate'] = { $lte: new Date(options.endDate) };
                    query['period.endDate'] = { $gte: new Date(options.startDate) };
                } else if (options.startDate) {
                    query['period.endDate'] = { $gte: new Date(options.startDate) };
                } else if (options.endDate) {
                    query['period.startDate'] = { $lte: new Date(options.endDate) };
                }
            }

            // Build sort
            const sortField = options.sortBy || 'period.startDate';
            const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
            const sort = { [sortField]: sortOrder };

            // Execute query with pagination
            const limit = Math.min(options.limit || 50, 100);
            const skip = options.skip || 0;

            const [records, total] = await Promise.all([
                ConsultantAvailability.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .exec(),
                ConsultantAvailability.countDocuments(query)
            ]);

            return {
                data: records.map(r => this._sanitizeAvailabilityOutput(r)),
                pagination: {
                    total,
                    limit,
                    skip,
                    hasMore: skip + records.length < total
                }
            };

        } catch (error) {
            logger.error('Failed to fetch consultant availability', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Get availability for multiple consultants within a date range
     * @param {Array<string>} consultantIds - Array of consultant IDs
     * @param {Date} startDate - Start date of range
     * @param {Date} endDate - End date of range
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {Array<string>} options.types - Filter by availability types
     * @param {boolean} options.excludeTimeOff - Exclude time-off records
     * @returns {Promise<Object>} Availability records grouped by consultant
     */
    async getBulkConsultantAvailability(consultantIds, startDate, endDate, options = {}) {
        try {
            logger.info('Fetching bulk consultant availability', {
                consultantCount: consultantIds.length,
                startDate,
                endDate
            });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            const query = {
                consultantId: { $in: consultantIds.map(id => new mongoose.Types.ObjectId(id)) },
                'status.isDeleted': false,
                'period.startDate': { $lte: new Date(endDate) },
                'period.endDate': { $gte: new Date(startDate) }
            };

            if (options.tenantId) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.types && options.types.length > 0) {
                query.type = { $in: options.types };
            }

            if (options.excludeTimeOff) {
                query.type = { $ne: AVAILABILITY_TYPES.TIME_OFF };
            }

            const records = await ConsultantAvailability.find(query)
                .sort({ 'period.startDate': 1 })
                .exec();

            // Group by consultant
            const groupedByConsultant = {};
            for (const record of records) {
                const consultantIdStr = record.consultantId.toString();
                if (!groupedByConsultant[consultantIdStr]) {
                    groupedByConsultant[consultantIdStr] = [];
                }
                groupedByConsultant[consultantIdStr].push(this._sanitizeAvailabilityOutput(record));
            }

            return {
                data: groupedByConsultant,
                period: { startDate, endDate },
                consultantCount: consultantIds.length,
                recordCount: records.length
            };

        } catch (error) {
            logger.error('Failed to fetch bulk consultant availability', {
                error: error.message,
                consultantCount: consultantIds.length
            });
            throw error;
        }
    }

    /**
     * Get pending time-off approval requests
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.managerId - Filter by manager ID
     * @param {string} options.organizationId - Filter by organization
     * @param {number} options.limit - Maximum number of records
     * @returns {Promise<Array>} Pending time-off requests
     */
    async getPendingTimeOffRequests(options = {}) {
        try {
            logger.info('Fetching pending time-off requests', {
                tenantId: options.tenantId,
                managerId: options.managerId
            });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            const query = {
                type: AVAILABILITY_TYPES.TIME_OFF,
                'timeOff.approvalStatus': APPROVAL_STATUS.PENDING,
                'status.isDeleted': false
            };

            if (options.tenantId) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.organizationId) {
                query.organizationId = new mongoose.Types.ObjectId(options.organizationId);
            }

            const records = await ConsultantAvailability.find(query)
                .populate('consultantId', 'profile.firstName profile.lastName consultantCode professional.manager')
                .sort({ 'timeOff.requestedAt': 1 })
                .limit(options.limit || 50)
                .exec();

            // Filter by manager if specified
            let filteredRecords = records;
            if (options.managerId) {
                filteredRecords = records.filter(r =>
                    r.consultantId?.professional?.manager?.toString() === options.managerId
                );
            }

            return filteredRecords.map(r => this._sanitizeAvailabilityOutput(r));

        } catch (error) {
            logger.error('Failed to fetch pending time-off requests', {
                error: error.message
            });
            throw error;
        }
    }

    // ============= AVAILABILITY UPDATE =============

    /**
     * Update availability record
     * @param {string} availabilityId - Availability record ID
     * @param {Object} updateData - Fields to update
     * @param {Object} updateData.period - Updated time period
     * @param {Object} updateData.capacity - Updated capacity details
     * @param {Object} updateData.preferences - Updated preferences
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated availability record
     */
    async updateAvailability(availabilityId, updateData, options = {}) {
        try {
            logger.info('Updating availability record', { availabilityId });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            // Find existing record
            const availability = await this._findAvailabilityRecord(availabilityId);

            // Check tenant access
            if (options.tenantId && !options.skipTenantCheck &&
                availability.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this availability record');
            }

            // Validate update data
            await this._validateAvailabilityUpdateData(updateData, availability);

            // Check for conflicts if period is being updated
            if (updateData.period && this.config.conflictCheckEnabled) {
                const newStartDate = updateData.period.startDate || availability.period.startDate;
                const newEndDate = updateData.period.endDate || availability.period.endDate;

                const conflicts = await this._checkAvailabilityConflicts(
                    availability.consultantId,
                    newStartDate,
                    newEndDate,
                    availability.type,
                    availability._id
                );

                if (conflicts.length > 0) {
                    throw AppError.conflict('Availability conflicts detected', {
                        context: { conflicts }
                    });
                }
            }

            // Build update object
            const updateFields = {};

            if (updateData.period) {
                if (updateData.period.startDate) updateFields['period.startDate'] = new Date(updateData.period.startDate);
                if (updateData.period.endDate) updateFields['period.endDate'] = new Date(updateData.period.endDate);
                if (updateData.period.startTime !== undefined) updateFields['period.startTime'] = updateData.period.startTime;
                if (updateData.period.endTime !== undefined) updateFields['period.endTime'] = updateData.period.endTime;
                if (updateData.period.timezone) updateFields['period.timezone'] = updateData.period.timezone;
                if (updateData.period.allDay !== undefined) updateFields['period.allDay'] = updateData.period.allDay;
            }

            if (updateData.capacity) {
                if (updateData.capacity.hoursAvailable !== undefined) updateFields['capacity.hoursAvailable'] = updateData.capacity.hoursAvailable;
                if (updateData.capacity.percentageAvailable !== undefined) updateFields['capacity.percentageAvailable'] = updateData.capacity.percentageAvailable;
                if (updateData.capacity.maxProjects !== undefined) updateFields['capacity.maxProjects'] = updateData.capacity.maxProjects;
                if (updateData.capacity.maxClients !== undefined) updateFields['capacity.maxClients'] = updateData.capacity.maxClients;
            }

            if (updateData.preferences) {
                Object.keys(updateData.preferences).forEach(key => {
                    updateFields[`preferences.${key}`] = updateData.preferences[key];
                });
            }

            if (updateData.availabilityStatus) {
                updateFields.availabilityStatus = updateData.availabilityStatus;
            }

            if (updateData.timeOff && availability.type === AVAILABILITY_TYPES.TIME_OFF) {
                if (updateData.timeOff.description !== undefined) updateFields['timeOff.description'] = updateData.timeOff.description;
                if (updateData.timeOff.isPaid !== undefined) updateFields['timeOff.isPaid'] = updateData.timeOff.isPaid;
            }

            if (updateData.metadata?.notes !== undefined) {
                updateFields['metadata.notes'] = updateData.metadata.notes;
            }

            updateFields['metadata.updatedBy'] = options.userId;

            // Execute update
            const updatedAvailability = await ConsultantAvailability.findByIdAndUpdate(
                availability._id,
                { $set: updateFields },
                { new: true, runValidators: true }
            );

            // Update consultant availability summary
            await this._updateConsultantAvailabilitySummary(availability.consultantId);

            // Track update event
            await this._trackAvailabilityEvent(updatedAvailability, 'availability_updated', {
                userId: options.userId,
                changes: Object.keys(updateFields)
            });

            logger.info('Availability record updated successfully', {
                availabilityId,
                changes: Object.keys(updateFields).length
            });

            return this._sanitizeAvailabilityOutput(updatedAvailability);

        } catch (error) {
            logger.error('Failed to update availability record', {
                error: error.message,
                availabilityId
            });
            throw error;
        }
    }

    // ============= TIME-OFF APPROVAL WORKFLOW =============

    /**
     * Approve time-off request
     * @param {string} availabilityId - Availability record ID
     * @param {Object} approvalData - Approval information
     * @param {string} approvalData.comments - Approval comments
     * @param {Object} options - Approval options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - Approver user ID
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Approved availability record
     */
    async approveTimeOff(availabilityId, approvalData = {}, options = {}) {
        try {
            logger.info('Approving time-off request', { availabilityId });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            const availability = await this._findAvailabilityRecord(availabilityId);

            // Validate this is a time-off record
            if (availability.type !== AVAILABILITY_TYPES.TIME_OFF) {
                throw AppError.validation('This record is not a time-off request');
            }

            // Check if already processed
            if (availability.timeOff.approvalStatus !== APPROVAL_STATUS.PENDING) {
                throw AppError.validation('This request has already been processed', {
                    context: { currentStatus: availability.timeOff.approvalStatus }
                });
            }

            // Check tenant access
            if (options.tenantId && !options.skipTenantCheck &&
                availability.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this availability record');
            }

            // Update approval status
            const updatedAvailability = await ConsultantAvailability.findByIdAndUpdate(
                availability._id,
                {
                    $set: {
                        'timeOff.approvalStatus': APPROVAL_STATUS.APPROVED,
                        'timeOff.approvedBy': options.userId,
                        'timeOff.approvedAt': new Date(),
                        'metadata.updatedBy': options.userId,
                        'metadata.notes': availability.metadata?.notes
                            ? `${availability.metadata.notes}\nApproval notes: ${approvalData.comments || 'Approved'}`
                            : `Approval notes: ${approvalData.comments || 'Approved'}`
                    }
                },
                { new: true }
            );

            // Update consultant availability
            await this._updateConsultantAvailabilitySummary(availability.consultantId);

            // Send notification to consultant
            await this._sendTimeOffNotification(updatedAvailability, 'approved', options);

            // Track event
            await this._trackAvailabilityEvent(updatedAvailability, 'time_off_approved', {
                approverId: options.userId,
                comments: approvalData.comments
            });

            logger.info('Time-off request approved', {
                availabilityId,
                approverId: options.userId
            });

            return this._sanitizeAvailabilityOutput(updatedAvailability);

        } catch (error) {
            logger.error('Failed to approve time-off request', {
                error: error.message,
                availabilityId
            });
            throw error;
        }
    }

    /**
     * Reject time-off request
     * @param {string} availabilityId - Availability record ID
     * @param {Object} rejectionData - Rejection information
     * @param {string} rejectionData.reason - Rejection reason (required)
     * @param {string} rejectionData.comments - Additional comments
     * @param {Object} options - Rejection options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - Rejector user ID
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Rejected availability record
     */
    async rejectTimeOff(availabilityId, rejectionData, options = {}) {
        try {
            logger.info('Rejecting time-off request', { availabilityId });

            if (!rejectionData.reason) {
                throw AppError.validation('Rejection reason is required');
            }

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            const availability = await this._findAvailabilityRecord(availabilityId);

            // Validate this is a time-off record
            if (availability.type !== AVAILABILITY_TYPES.TIME_OFF) {
                throw AppError.validation('This record is not a time-off request');
            }

            // Check if already processed
            if (availability.timeOff.approvalStatus !== APPROVAL_STATUS.PENDING) {
                throw AppError.validation('This request has already been processed');
            }

            // Check tenant access
            if (options.tenantId && !options.skipTenantCheck &&
                availability.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this availability record');
            }

            // Update rejection status
            const updatedAvailability = await ConsultantAvailability.findByIdAndUpdate(
                availability._id,
                {
                    $set: {
                        'timeOff.approvalStatus': APPROVAL_STATUS.REJECTED,
                        'timeOff.rejectionReason': rejectionData.reason,
                        'status.current': 'rejected',
                        'status.isActive': false,
                        'metadata.updatedBy': options.userId,
                        'metadata.notes': availability.metadata?.notes
                            ? `${availability.metadata.notes}\nRejection reason: ${rejectionData.reason}`
                            : `Rejection reason: ${rejectionData.reason}`
                    }
                },
                { new: true }
            );

            // Send notification to consultant
            await this._sendTimeOffNotification(updatedAvailability, 'rejected', options);

            // Track event
            await this._trackAvailabilityEvent(updatedAvailability, 'time_off_rejected', {
                rejectorId: options.userId,
                reason: rejectionData.reason
            });

            logger.info('Time-off request rejected', {
                availabilityId,
                rejectorId: options.userId,
                reason: rejectionData.reason
            });

            return this._sanitizeAvailabilityOutput(updatedAvailability);

        } catch (error) {
            logger.error('Failed to reject time-off request', {
                error: error.message,
                availabilityId
            });
            throw error;
        }
    }

    /**
     * Cancel time-off request
     * @param {string} availabilityId - Availability record ID
     * @param {Object} cancellationData - Cancellation information
     * @param {string} cancellationData.reason - Cancellation reason
     * @param {Object} options - Cancellation options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing cancellation
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Cancelled availability record
     */
    async cancelTimeOff(availabilityId, cancellationData = {}, options = {}) {
        try {
            logger.info('Cancelling time-off request', { availabilityId });

            const availability = await this._findAvailabilityRecord(availabilityId);

            // Validate this is a time-off record
            if (availability.type !== AVAILABILITY_TYPES.TIME_OFF) {
                throw AppError.validation('This record is not a time-off request');
            }

            // Check if can be cancelled
            const cancellableStatuses = [APPROVAL_STATUS.PENDING, APPROVAL_STATUS.APPROVED];
            if (!cancellableStatuses.includes(availability.timeOff.approvalStatus)) {
                throw AppError.validation('This request cannot be cancelled');
            }

            // Check tenant access
            if (options.tenantId && !options.skipTenantCheck &&
                availability.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this availability record');
            }

            // Use instance method
            await availability.cancel(options.userId, cancellationData.reason || 'Cancelled by user');

            // Update consultant availability
            await this._updateConsultantAvailabilitySummary(availability.consultantId);

            // Track event
            await this._trackAvailabilityEvent(availability, 'time_off_cancelled', {
                userId: options.userId,
                reason: cancellationData.reason
            });

            logger.info('Time-off request cancelled', { availabilityId });

            return this._sanitizeAvailabilityOutput(availability);

        } catch (error) {
            logger.error('Failed to cancel time-off request', {
                error: error.message,
                availabilityId
            });
            throw error;
        }
    }

    // ============= AVAILABILITY DELETION =============

    /**
     * Delete availability record (soft delete)
     * @param {string} availabilityId - Availability record ID
     * @param {Object} options - Delete options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing deletion
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {boolean} options.hardDelete - Perform permanent deletion
     * @returns {Promise<Object>} Deletion result
     */
    async deleteAvailability(availabilityId, options = {}) {
        try {
            logger.info('Deleting availability record', { availabilityId, hardDelete: options.hardDelete });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            const availability = await this._findAvailabilityRecord(availabilityId);

            // Check tenant access
            if (options.tenantId && !options.skipTenantCheck &&
                availability.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this availability record');
            }

            const consultantId = availability.consultantId;

            if (options.hardDelete) {
                // Permanent deletion
                await ConsultantAvailability.findByIdAndDelete(availability._id);
            } else {
                // Soft delete
                await ConsultantAvailability.findByIdAndUpdate(availability._id, {
                    $set: {
                        'status.isDeleted': true,
                        'status.deletedAt': new Date(),
                        'status.deletedBy': options.userId,
                        'status.isActive': false
                    }
                });
            }

            // Update consultant availability summary
            await this._updateConsultantAvailabilitySummary(consultantId);

            // Track event
            await this._trackAvailabilityEvent(availability, 'availability_deleted', {
                userId: options.userId,
                hardDelete: options.hardDelete
            });

            logger.info('Availability record deleted', {
                availabilityId,
                hardDelete: options.hardDelete
            });

            return {
                success: true,
                availabilityId: availability.availabilityId,
                deleted: true
            };

        } catch (error) {
            logger.error('Failed to delete availability record', {
                error: error.message,
                availabilityId
            });
            throw error;
        }
    }

    // ============= CAPACITY & SCHEDULING =============

    /**
     * Get consultant capacity for a date range
     * @param {string} consultantId - Consultant ID
     * @param {Date} startDate - Start date of range
     * @param {Date} endDate - End date of range
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {boolean} options.excludeTimeOff - Exclude approved time-off from calculations
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Capacity information
     */
    async getConsultantCapacity(consultantId, startDate, endDate, options = {}) {
        try {
            logger.info('Calculating consultant capacity', {
                consultantId,
                startDate,
                endDate
            });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Get consultant's base availability settings
            const consultant = await Consultant.findById(consultantId);
            if (!consultant) {
                throw AppError.notFound('Consultant not found');
            }

            // Calculate working days in range
            const totalDays = this._calculateBusinessDays(startDate, endDate);
            const baseHoursPerDay = consultant.availability?.hoursPerWeek
                ? consultant.availability.hoursPerWeek / this.config.defaultWorkDaysPerWeek
                : this.config.defaultWorkHoursPerDay;
            const totalCapacityHours = totalDays * baseHoursPerDay;

            // Get availability records that affect this period
            const availabilityRecords = await ConsultantAvailability.find({
                consultantId: new mongoose.Types.ObjectId(consultantId),
                'status.isDeleted': false,
                'period.startDate': { $lte: new Date(endDate) },
                'period.endDate': { $gte: new Date(startDate) }
            });

            // Calculate reductions
            let timeOffHours = 0;
            let blackoutHours = 0;
            let trainingHours = 0;

            for (const record of availabilityRecords) {
                const overlapDays = this._calculateOverlapDays(
                    record.period.startDate,
                    record.period.endDate,
                    startDate,
                    endDate
                );
                const hours = overlapDays * baseHoursPerDay;

                switch (record.type) {
                    case AVAILABILITY_TYPES.TIME_OFF:
                        if (record.timeOff?.approvalStatus === APPROVAL_STATUS.APPROVED ||
                            (!options.excludeTimeOff && record.timeOff?.approvalStatus === APPROVAL_STATUS.PENDING)) {
                            timeOffHours += hours;
                        }
                        break;
                    case AVAILABILITY_TYPES.BLACKOUT:
                        blackoutHours += hours;
                        break;
                    case AVAILABILITY_TYPES.TRAINING:
                    case AVAILABILITY_TYPES.INTERNAL:
                        trainingHours += hours;
                        break;
                }
            }

            const availableHours = Math.max(0, totalCapacityHours - timeOffHours - blackoutHours - trainingHours);
            const utilizationTarget = consultant.availability?.utilizationTarget || this.config.defaultUtilizationTarget;
            const billableTargetHours = availableHours * (utilizationTarget / 100);

            return {
                consultantId,
                period: { startDate, endDate },
                workingDays: totalDays,
                totalCapacityHours,
                deductions: {
                    timeOffHours,
                    blackoutHours,
                    trainingHours,
                    totalDeductions: timeOffHours + blackoutHours + trainingHours
                },
                availableHours,
                billableTargetHours,
                utilizationTarget,
                capacityPercentage: Math.round((availableHours / totalCapacityHours) * 100)
            };

        } catch (error) {
            logger.error('Failed to calculate consultant capacity', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Find available consultants for a date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {number} options.minCapacityPercentage - Minimum capacity percentage required
     * @param {Array<string>} options.skills - Required skills
     * @param {string} options.practiceArea - Required practice area
     * @param {number} options.limit - Maximum results
     * @returns {Promise<Object>} Available consultants with capacity info
     */
    async findAvailableConsultants(startDate, endDate, options = {}) {
        try {
            logger.info('Finding available consultants', {
                startDate,
                endDate,
                minCapacity: options.minCapacityPercentage
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Build consultant query
            const consultantQuery = {
                'status.isActive': true,
                'status.isDeleted': false,
                'availability.status': { $in: ['available', 'partially_available'] }
            };

            if (options.tenantId) {
                consultantQuery.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.practiceArea) {
                consultantQuery['professional.practiceArea'] = options.practiceArea;
            }

            if (options.skills && options.skills.length > 0) {
                consultantQuery['skills.name'] = { $in: options.skills };
            }

            // Get all potentially available consultants
            const consultants = await Consultant.find(consultantQuery)
                .select('profile.firstName profile.lastName consultantCode professional.level availability skills')
                .limit(options.limit || 50)
                .exec();

            // Calculate capacity for each consultant
            const availableConsultants = [];
            const minCapacity = options.minCapacityPercentage || 50;

            for (const consultant of consultants) {
                const capacity = await this.getConsultantCapacity(
                    consultant._id.toString(),
                    startDate,
                    endDate,
                    { tenantId: options.tenantId }
                );

                if (capacity.capacityPercentage >= minCapacity) {
                    availableConsultants.push({
                        consultant: {
                            _id: consultant._id,
                            consultantCode: consultant.consultantCode,
                            name: `${consultant.profile?.firstName} ${consultant.profile?.lastName}`,
                            level: consultant.professional?.level
                        },
                        capacity
                    });
                }
            }

            // Sort by available hours descending
            availableConsultants.sort((a, b) => b.capacity.availableHours - a.capacity.availableHours);

            return {
                consultants: availableConsultants,
                period: { startDate, endDate },
                totalFound: availableConsultants.length
            };

        } catch (error) {
            logger.error('Failed to find available consultants', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Check for scheduling conflicts
     * @param {string} consultantId - Consultant ID
     * @param {Date} startDate - Proposed start date
     * @param {Date} endDate - Proposed end date
     * @param {Object} options - Query options
     * @param {string} options.excludeAvailabilityId - Availability ID to exclude from check
     * @returns {Promise<Array>} Array of conflicting records
     */
    async checkConflicts(consultantId, startDate, endDate, options = {}) {
        try {
            logger.info('Checking availability conflicts', {
                consultantId,
                startDate,
                endDate
            });

            return this._checkAvailabilityConflicts(
                consultantId,
                startDate,
                endDate,
                null,
                options.excludeAvailabilityId
            );

        } catch (error) {
            logger.error('Failed to check conflicts', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============= REPORTS & ANALYTICS =============

    /**
     * Get time-off balance for a consultant
     * @param {string} consultantId - Consultant ID
     * @param {number} year - Year to calculate balance for
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Time-off balance breakdown
     */
    async getTimeOffBalance(consultantId, year, options = {}) {
        try {
            logger.info('Getting time-off balance', { consultantId, year });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            const balance = await ConsultantAvailability.getTimeOffBalance(
                options.tenantId || this.config.companyTenantId,
                consultantId,
                year
            );

            // Calculate totals
            const totals = {
                totalDaysUsed: 0,
                totalHoursUsed: 0,
                byReason: {}
            };

            for (const item of balance) {
                totals.totalDaysUsed += item.totalDays || 0;
                totals.totalHoursUsed += item.totalHours || 0;
                totals.byReason[item._id] = {
                    days: item.totalDays,
                    hours: item.totalHours,
                    count: item.count
                };
            }

            return {
                consultantId,
                year,
                balance: totals,
                details: balance
            };

        } catch (error) {
            logger.error('Failed to get time-off balance', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Get capacity report for organization
     * @param {Date} startDate - Report start date
     * @param {Date} endDate - Report end date
     * @param {Object} options - Report options
     * @param {string} options.tenantId - Tenant ID
     * @param {string} options.organizationId - Filter by organization
     * @param {string} options.departmentId - Filter by department
     * @returns {Promise<Object>} Capacity report
     */
    async getCapacityReport(startDate, endDate, options = {}) {
        try {
            logger.info('Generating capacity report', {
                startDate,
                endDate,
                tenantId: options.tenantId
            });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            const report = await ConsultantAvailability.getCapacityReport(
                options.tenantId || this.config.companyTenantId,
                new Date(startDate),
                new Date(endDate)
            );

            // Calculate summary
            const summary = {
                totalConsultants: report.length,
                totalDaysOff: report.reduce((sum, r) => sum + (r.totalDaysOff || 0), 0),
                averageDaysOff: report.length > 0
                    ? report.reduce((sum, r) => sum + (r.totalDaysOff || 0), 0) / report.length
                    : 0
            };

            return {
                period: { startDate, endDate },
                summary,
                consultants: report,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to generate capacity report', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get availability statistics
     * @param {Object} options - Statistics options
     * @param {string} options.tenantId - Tenant ID
     * @param {string} options.organizationId - Filter by organization
     * @param {Date} options.startDate - Start date for statistics
     * @param {Date} options.endDate - End date for statistics
     * @returns {Promise<Object>} Availability statistics
     */
    async getAvailabilityStatistics(options = {}) {
        try {
            logger.info('Generating availability statistics', {
                tenantId: options.tenantId
            });

            const dbService = this._getDatabaseService();
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            const matchStage = {
                'status.isDeleted': false
            };

            if (options.tenantId) {
                matchStage.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.organizationId) {
                matchStage.organizationId = new mongoose.Types.ObjectId(options.organizationId);
            }

            if (options.startDate && options.endDate) {
                matchStage['period.startDate'] = { $lte: new Date(options.endDate) };
                matchStage['period.endDate'] = { $gte: new Date(options.startDate) };
            }

            const stats = await ConsultantAvailability.aggregate([
                { $match: matchStage },
                {
                    $facet: {
                        byType: [
                            { $group: { _id: '$type', count: { $sum: 1 } } }
                        ],
                        byStatus: [
                            { $group: { _id: '$availabilityStatus', count: { $sum: 1 } } }
                        ],
                        byTimeOffReason: [
                            { $match: { type: AVAILABILITY_TYPES.TIME_OFF } },
                            { $group: { _id: '$timeOff.reason', count: { $sum: 1 } } }
                        ],
                        byApprovalStatus: [
                            { $match: { type: AVAILABILITY_TYPES.TIME_OFF } },
                            { $group: { _id: '$timeOff.approvalStatus', count: { $sum: 1 } } }
                        ],
                        pendingCount: [
                            {
                                $match: {
                                    type: AVAILABILITY_TYPES.TIME_OFF,
                                    'timeOff.approvalStatus': APPROVAL_STATUS.PENDING
                                }
                            },
                            { $count: 'total' }
                        ],
                        totals: [
                            { $count: 'total' }
                        ]
                    }
                }
            ]);

            const result = stats[0];

            return {
                distribution: {
                    byType: result.byType,
                    byStatus: result.byStatus,
                    byTimeOffReason: result.byTimeOffReason,
                    byApprovalStatus: result.byApprovalStatus
                },
                pendingApprovals: result.pendingCount[0]?.total || 0,
                totalRecords: result.totals[0]?.total || 0,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to generate availability statistics', {
                error: error.message
            });
            throw error;
        }
    }

    // ============= PRIVATE HELPER METHODS =============

    /**
     * Find availability record by ID or availabilityId
     * @private
     * @param {string} availabilityId - Record ID
     * @returns {Promise<Object>} Availability document
     */
    async _findAvailabilityRecord(availabilityId) {
        const dbService = this._getDatabaseService();
        const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

        let availability;
        if (mongoose.Types.ObjectId.isValid(availabilityId)) {
            availability = await ConsultantAvailability.findById(availabilityId);
        }

        if (!availability) {
            availability = await ConsultantAvailability.findOne({
                availabilityId: availabilityId.toUpperCase()
            });
        }

        if (!availability) {
            throw AppError.notFound('Availability record not found', {
                context: { availabilityId }
            });
        }

        return availability;
    }

    /**
     * Generate availability ID
     * @private
     * @returns {string} Generated availability ID
     */
    _generateAvailabilityId() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `AVL-${timestamp}${random}`;
    }

    /**
     * Validate availability data
     * @private
     * @param {Object} data - Availability data
     */
    async _validateAvailabilityData(data) {
        const errors = [];

        if (!data.type || !Object.values(AVAILABILITY_TYPES).includes(data.type)) {
            errors.push('Valid availability type is required');
        }

        if (!data.period?.startDate) {
            errors.push('Start date is required');
        }

        if (!data.period?.endDate) {
            errors.push('End date is required');
        }

        if (data.period?.startDate && data.period?.endDate) {
            const start = new Date(data.period.startDate);
            const end = new Date(data.period.endDate);

            if (end < start) {
                errors.push('End date cannot be before start date');
            }

            // Check max look-ahead
            const maxDate = new Date();
            maxDate.setDate(maxDate.getDate() + this.config.maxLookAheadDays);
            if (start > maxDate) {
                errors.push(`Start date cannot be more than ${this.config.maxLookAheadDays} days in the future`);
            }
        }

        if (data.capacity?.percentageAvailable !== undefined) {
            if (data.capacity.percentageAvailable < 0 || data.capacity.percentageAvailable > 100) {
                errors.push('Percentage available must be between 0 and 100');
            }
        }

        if (errors.length > 0) {
            throw AppError.validation('Availability validation failed', { errors });
        }
    }

    /**
     * Validate time-off request
     * @private
     * @param {Object} data - Time-off data
     */
    async _validateTimeOffRequest(data) {
        const errors = [];

        if (!data.startDate) {
            errors.push('Start date is required');
        }

        if (!data.endDate) {
            errors.push('End date is required');
        }

        if (data.startDate && data.endDate) {
            const start = new Date(data.startDate);
            const end = new Date(data.endDate);
            const now = new Date();
            now.setHours(0, 0, 0, 0);

            if (start < now) {
                errors.push('Start date cannot be in the past');
            }

            const daysRequested = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            if (daysRequested > this.config.maxTimeOffDaysPerRequest) {
                errors.push(`Time-off request cannot exceed ${this.config.maxTimeOffDaysPerRequest} days`);
            }

            // Check advance notice
            const daysUntilStart = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
            if (daysUntilStart < this.config.advanceNoticeRequired && daysRequested > this.config.autoApproveTimeOffDays) {
                errors.push(`Requests of more than ${this.config.autoApproveTimeOffDays} days require ${this.config.advanceNoticeRequired} days advance notice`);
            }
        }

        if (data.reason && !Object.values(TIME_OFF_REASONS).includes(data.reason)) {
            errors.push('Invalid time-off reason');
        }

        if (errors.length > 0) {
            throw AppError.validation('Time-off request validation failed', { errors });
        }
    }

    /**
     * Validate availability update data
     * @private
     * @param {Object} updateData - Update data
     * @param {Object} existingRecord - Existing availability record
     */
    async _validateAvailabilityUpdateData(updateData, existingRecord) {
        const errors = [];

        if (updateData.period) {
            const start = updateData.period.startDate
                ? new Date(updateData.period.startDate)
                : existingRecord.period.startDate;
            const end = updateData.period.endDate
                ? new Date(updateData.period.endDate)
                : existingRecord.period.endDate;

            if (end < start) {
                errors.push('End date cannot be before start date');
            }
        }

        if (updateData.capacity?.percentageAvailable !== undefined) {
            if (updateData.capacity.percentageAvailable < 0 || updateData.capacity.percentageAvailable > 100) {
                errors.push('Percentage available must be between 0 and 100');
            }
        }

        // Prevent certain updates for approved time-off
        if (existingRecord.type === AVAILABILITY_TYPES.TIME_OFF &&
            existingRecord.timeOff?.approvalStatus === APPROVAL_STATUS.APPROVED) {
            if (updateData.period?.startDate || updateData.period?.endDate) {
                errors.push('Cannot modify dates of approved time-off request');
            }
        }

        if (errors.length > 0) {
            throw AppError.validation('Update validation failed', { errors });
        }
    }

    /**
     * Check for availability conflicts
     * @private
     * @param {string} consultantId - Consultant ID
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @param {string} type - Availability type
     * @param {string} excludeId - ID to exclude from check
     * @returns {Promise<Array>} Conflicting records
     */
    async _checkAvailabilityConflicts(consultantId, startDate, endDate, type, excludeId = null) {
        const dbService = this._getDatabaseService();
        const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

        return ConsultantAvailability.findOverlapping(
            null, // tenantId is checked separately
            consultantId,
            new Date(startDate),
            new Date(endDate),
            excludeId
        );
    }

    /**
     * Determine initial approval status for time-off
     * @private
     * @param {Object} data - Availability data
     * @param {Object} consultant - Consultant document
     * @param {Object} options - Options
     * @returns {Promise<string>} Approval status
     */
    async _determineApprovalStatus(data, consultant, options) {
        const daysRequested = this._calculateDaysRequested(data.period);

        // Auto-approve short requests
        if (daysRequested <= this.config.autoApproveTimeOffDays) {
            return APPROVAL_STATUS.AUTO_APPROVED;
        }

        // Auto-approve for certain roles (could be enhanced with role checks)
        if (consultant.professional?.level === 'partner' || consultant.professional?.level === 'director') {
            return APPROVAL_STATUS.AUTO_APPROVED;
        }

        return APPROVAL_STATUS.PENDING;
    }

    /**
     * Determine availability status based on data
     * @private
     * @param {Object} data - Availability data
     * @returns {string} Availability status
     */
    _determineAvailabilityStatus(data) {
        if (data.type === AVAILABILITY_TYPES.TIME_OFF ||
            data.type === AVAILABILITY_TYPES.BLACKOUT ||
            data.type === AVAILABILITY_TYPES.HOLIDAY) {
            return AVAILABILITY_STATUS.UNAVAILABLE;
        }

        if (data.capacity?.percentageAvailable === 0) {
            return AVAILABILITY_STATUS.UNAVAILABLE;
        }

        if (data.capacity?.percentageAvailable < 100) {
            return AVAILABILITY_STATUS.PARTIALLY_AVAILABLE;
        }

        return AVAILABILITY_STATUS.AVAILABLE;
    }

    /**
     * Calculate hours used for time-off
     * @private
     * @param {Object} period - Time period
     * @returns {number} Hours used
     */
    _calculateHoursUsed(period) {
        const days = this._calculateDaysRequested(period);
        return days * this.config.defaultWorkHoursPerDay;
    }

    /**
     * Calculate days requested
     * @private
     * @param {Object} period - Time period
     * @returns {number} Number of days
     */
    _calculateDaysRequested(period) {
        const start = new Date(period.startDate);
        const end = new Date(period.endDate);
        return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    }

    /**
     * Calculate business days between dates
     * @private
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {number} Business days count
     */
    _calculateBusinessDays(startDate, endDate) {
        let count = 0;
        const current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                count++;
            }
            current.setDate(current.getDate() + 1);
        }

        return count;
    }

    /**
     * Calculate overlap days between two date ranges
     * @private
     * @param {Date} start1 - First range start
     * @param {Date} end1 - First range end
     * @param {Date} start2 - Second range start
     * @param {Date} end2 - Second range end
     * @returns {number} Overlapping days
     */
    _calculateOverlapDays(start1, end1, start2, end2) {
        const overlapStart = new Date(Math.max(start1.getTime(), new Date(start2).getTime()));
        const overlapEnd = new Date(Math.min(end1.getTime(), new Date(end2).getTime()));

        if (overlapEnd < overlapStart) {
            return 0;
        }

        return Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
    }

    /**
     * Update consultant's availability summary
     * @private
     * @param {string} consultantId - Consultant ID
     */
    async _updateConsultantAvailabilitySummary(consultantId) {
        try {
            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');
            const ConsultantAvailability = dbService.getModel('ConsultantAvailability', 'customer');

            const now = new Date();

            // Get current active availability records
            const activeRecords = await ConsultantAvailability.find({
                consultantId: new mongoose.Types.ObjectId(consultantId),
                'status.isDeleted': false,
                'status.current': { $ne: 'cancelled' },
                'period.endDate': { $gte: now }
            });

            // Determine overall availability status
            let status = 'available';
            let capacityPercentage = 100;

            for (const record of activeRecords) {
                if (record.period.startDate <= now && record.period.endDate >= now) {
                    if (record.type === AVAILABILITY_TYPES.TIME_OFF &&
                        record.timeOff?.approvalStatus === APPROVAL_STATUS.APPROVED) {
                        status = 'on_leave';
                        capacityPercentage = 0;
                        break;
                    } else if (record.type === AVAILABILITY_TYPES.BLACKOUT) {
                        status = 'unavailable';
                        capacityPercentage = 0;
                        break;
                    } else if (record.availabilityStatus === AVAILABILITY_STATUS.PARTIALLY_AVAILABLE) {
                        status = 'partially_available';
                        capacityPercentage = Math.min(capacityPercentage, record.capacity?.percentageAvailable || 50);
                    }
                }
            }

            await Consultant.findByIdAndUpdate(consultantId, {
                $set: {
                    'availability.status': status,
                    'availability.capacityPercentage': capacityPercentage,
                    'availability.lastUpdated': now
                }
            });

        } catch (error) {
            logger.warn('Failed to update consultant availability summary', {
                error: error.message,
                consultantId
            });
        }
    }

    /**
     * Handle post-creation workflows
     * @private
     * @param {Object} availability - Created availability record
     * @param {Object} consultant - Consultant document
     * @param {Object} options - Options
     */
    async _handlePostAvailabilityCreation(availability, consultant, options) {
        try {
            // Send notifications for time-off requests
            if (availability.type === AVAILABILITY_TYPES.TIME_OFF) {
                if (availability.timeOff?.approvalStatus === APPROVAL_STATUS.AUTO_APPROVED) {
                    await this._sendTimeOffNotification(availability, 'auto_approved', options);
                } else if (availability.notifications?.notifyManager && consultant.professional?.manager) {
                    await this._sendManagerNotification(availability, consultant);
                }
            }

            // Track creation event
            await this._trackAvailabilityEvent(availability, 'availability_created', {
                userId: options.userId
            });

        } catch (error) {
            logger.warn('Post-creation workflows failed', {
                error: error.message,
                availabilityId: availability._id
            });
        }
    }

    /**
     * Send time-off notification
     * @private
     * @param {Object} availability - Availability record
     * @param {string} action - Action type (approved, rejected, auto_approved)
     * @param {Object} options - Options
     */
    async _sendTimeOffNotification(availability, action, options) {
        try {
            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await Consultant.findById(availability.consultantId)
                .select('contact.email.primary profile.firstName');

            if (consultant?.contact?.email?.primary) {
                await this.notificationService?.sendEmail?.({
                    to: consultant.contact.email.primary,
                    template: `time_off_${action}`,
                    data: {
                        firstName: consultant.profile?.firstName,
                        startDate: availability.period.startDate,
                        endDate: availability.period.endDate,
                        reason: availability.timeOff?.reason,
                        rejectionReason: availability.timeOff?.rejectionReason
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send time-off notification', {
                error: error.message,
                availabilityId: availability._id
            });
        }
    }

    /**
     * Send manager notification for time-off request
     * @private
     * @param {Object} availability - Availability record
     * @param {Object} consultant - Consultant document
     */
    async _sendManagerNotification(availability, consultant) {
        try {
            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const manager = await Consultant.findById(consultant.professional.manager)
                .select('contact.email.primary profile.firstName');

            if (manager?.contact?.email?.primary) {
                await this.notificationService?.sendEmail?.({
                    to: manager.contact.email.primary,
                    template: 'time_off_approval_required',
                    data: {
                        managerName: manager.profile?.firstName,
                        consultantName: `${consultant.profile?.firstName} ${consultant.profile?.lastName}`,
                        startDate: availability.period.startDate,
                        endDate: availability.period.endDate,
                        reason: availability.timeOff?.reason,
                        approvalUrl: `${this.config.platformUrl}/approvals/time-off/${availability._id}`
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send manager notification', {
                error: error.message,
                availabilityId: availability._id
            });
        }
    }

    /**
     * Track availability event
     * @private
     * @param {Object} availability - Availability record
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     */
    async _trackAvailabilityEvent(availability, eventType, data) {
        try {
            await this.analyticsService?.trackEvent?.({
                eventType,
                entityType: 'consultant_availability',
                entityId: availability._id,
                tenantId: availability.tenantId,
                data: {
                    availabilityId: availability.availabilityId,
                    consultantId: availability.consultantId,
                    type: availability.type,
                    ...data
                },
                timestamp: new Date()
            });
        } catch (error) {
            logger.warn('Failed to track availability event', {
                error: error.message,
                eventType,
                availabilityId: availability._id
            });
        }
    }

    /**
     * Sanitize availability output
     * @private
     * @param {Object} availability - Availability document
     * @returns {Object} Sanitized availability
     */
    _sanitizeAvailabilityOutput(availability) {
        if (!availability) return null;

        const sanitized = availability.toObject ? availability.toObject() : { ...availability };

        // Remove internal fields
        delete sanitized.__v;

        return sanitized;
    }
}

// Export singleton instance
module.exports = new ConsultantAvailabilityService();
module.exports.ConsultantAvailabilityService = ConsultantAvailabilityService;
module.exports.AVAILABILITY_TYPES = AVAILABILITY_TYPES;
module.exports.AVAILABILITY_STATUS = AVAILABILITY_STATUS;
module.exports.TIME_OFF_REASONS = TIME_OFF_REASONS;
module.exports.APPROVAL_STATUS = APPROVAL_STATUS;
module.exports.RECURRENCE_PATTERNS = RECURRENCE_PATTERNS;