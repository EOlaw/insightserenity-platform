'use strict';

/**
 * @fileoverview Consultant Availability Model - Detailed availability and scheduling management
 * @module shared/lib/database/models/customer-services/core-business/consultant-management/consultant-availability-model
 * @description Manages consultant availability windows, scheduling constraints, and capacity tracking
 * @requires mongoose
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const logger = require('../../../../../utils/logger');

/**
 * Consultant Availability Schema Definition
 * Tracks detailed availability patterns, time-off, and capacity management
 */
const consultantAvailabilitySchemaDefinition = {
    // ==================== Core Identity ====================
    availabilityId: {
        type: String,
        unique: true,
        required: true,
        uppercase: true,
        match: /^AVL-[A-Z0-9-]+$/,
        index: true,
        immutable: true
    },

    // ==================== Multi-Tenancy ====================
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true,
        immutable: true
    },

    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },

    // ==================== Relationships ====================
    consultantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consultant',
        required: true,
        index: true
    },

    // ==================== Availability Type ====================
    type: {
        type: String,
        enum: ['regular', 'exception', 'time_off', 'holiday', 'blackout', 'override', 'training', 'internal'],
        required: true,
        index: true
    },

    // ==================== Time Period ====================
    period: {
        startDate: {
            type: Date,
            required: true,
            index: true
        },
        endDate: {
            type: Date,
            required: true,
            index: true
        },
        startTime: {
            type: String,
            match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
        },
        endTime: {
            type: String,
            match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
        },
        timezone: {
            type: String,
            default: 'UTC'
        },
        allDay: {
            type: Boolean,
            default: false
        }
    },

    // ==================== Recurrence Pattern ====================
    recurrence: {
        isRecurring: {
            type: Boolean,
            default: false
        },
        pattern: {
            type: String,
            enum: ['daily', 'weekly', 'bi_weekly', 'monthly', 'yearly', 'custom']
        },
        frequency: {
            type: Number,
            min: 1,
            default: 1
        },
        daysOfWeek: [{
            type: Number,
            min: 0,
            max: 6
        }],
        dayOfMonth: {
            type: Number,
            min: 1,
            max: 31
        },
        monthOfYear: {
            type: Number,
            min: 1,
            max: 12
        },
        endRecurrence: {
            type: {
                type: String,
                enum: ['never', 'after_occurrences', 'on_date']
            },
            occurrences: Number,
            endDate: Date
        },
        exceptions: [{
            date: Date,
            reason: String
        }]
    },

    // ==================== Capacity Details ====================
    capacity: {
        hoursAvailable: {
            type: Number,
            min: 0,
            max: 24
        },
        percentageAvailable: {
            type: Number,
            min: 0,
            max: 100,
            default: 100
        },
        maxProjects: {
            type: Number,
            min: 0
        },
        maxClients: {
            type: Number,
            min: 0
        },
        preferredHoursPerDay: {
            type: Number,
            min: 0,
            max: 24
        },
        billableTarget: {
            type: Number,
            min: 0,
            max: 100
        }
    },

    // ==================== Availability Status ====================
    availabilityStatus: {
        type: String,
        enum: ['available', 'partially_available', 'unavailable', 'tentative', 'pending_approval'],
        default: 'available',
        index: true
    },

    // ==================== Time Off Details ====================
    timeOff: {
        reason: {
            type: String,
            enum: ['vacation', 'sick', 'personal', 'bereavement', 'parental', 'jury_duty', 'military', 'sabbatical', 'training', 'conference', 'public_holiday', 'company_holiday', 'other']
        },
        description: {
            type: String,
            maxlength: 500
        },
        isPaid: {
            type: Boolean,
            default: true
        },
        hoursUsed: {
            type: Number,
            min: 0
        },
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'cancelled', 'auto_approved'],
            default: 'pending'
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        approvedAt: Date,
        rejectionReason: String,
        requestedAt: Date,
        attachments: [{
            name: String,
            url: String,
            type: String,
            uploadedAt: Date
        }]
    },

    // ==================== Work Preferences ====================
    preferences: {
        workLocation: {
            type: String,
            enum: ['remote', 'office', 'client_site', 'hybrid', 'flexible']
        },
        preferredLocations: [{
            type: String
        }],
        excludedLocations: [{
            type: String
        }],
        projectTypes: [{
            type: String,
            enum: ['implementation', 'strategy', 'advisory', 'training', 'support', 'audit', 'transformation', 'integration']
        }],
        clientTypes: [{
            type: String,
            enum: ['enterprise', 'mid_market', 'startup', 'government', 'non_profit', 'education']
        }],
        excludedClients: [{
            clientId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Client'
            },
            reason: String
        }],
        travelWillingness: {
            type: String,
            enum: ['none', 'local', 'regional', 'national', 'international']
        },
        travelPercentage: {
            type: Number,
            min: 0,
            max: 100
        }
    },

    // ==================== Notifications & Reminders ====================
    notifications: {
        notifyManager: {
            type: Boolean,
            default: true
        },
        notifyTeam: {
            type: Boolean,
            default: false
        },
        notifyClients: {
            type: Boolean,
            default: false
        },
        reminderSent: {
            type: Boolean,
            default: false
        },
        reminderDays: {
            type: Number,
            default: 7
        },
        autoReply: {
            enabled: Boolean,
            message: String
        }
    },

    // ==================== Impact Assessment ====================
    impact: {
        affectedProjects: [{
            projectId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Project'
            },
            projectName: String,
            impactLevel: {
                type: String,
                enum: ['none', 'low', 'medium', 'high', 'critical']
            },
            mitigationPlan: String,
            coveringConsultant: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Consultant'
            }
        }],
        affectedClients: [{
            clientId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Client'
            },
            clientName: String,
            notified: Boolean,
            notifiedAt: Date
        }],
        affectedMeetings: [{
            meetingId: String,
            meetingTitle: String,
            rescheduled: Boolean,
            newDate: Date
        }],
        handoverPlan: {
            required: Boolean,
            completed: Boolean,
            completedAt: Date,
            notes: String,
            handoverTo: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Consultant'
            }
        }
    },

    // ==================== Conflict Detection ====================
    conflicts: [{
        conflictType: {
            type: String,
            enum: ['booking', 'time_off', 'meeting', 'training', 'assignment']
        },
        conflictingEntityId: mongoose.Schema.Types.ObjectId,
        conflictingEntityType: String,
        description: String,
        resolution: {
            type: String,
            enum: ['pending', 'resolved', 'override', 'cancelled']
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        resolvedAt: Date,
        resolutionNotes: String
    }],

    // ==================== Status & Lifecycle ====================
    status: {
        current: {
            type: String,
            enum: ['active', 'cancelled', 'completed', 'expired'],
            default: 'active',
            index: true
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true
        },
        deletedAt: Date,
        deletedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        cancelledAt: Date,
        cancelledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        cancellationReason: String
    },

    // ==================== Metadata ====================
    metadata: {
        source: {
            type: String,
            enum: ['manual', 'calendar_sync', 'hr_system', 'import', 'api', 'recurring_generation']
        },
        externalId: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        notes: String,
        tags: [{
            type: String
        }]
    }
};

const consultantAvailabilitySchema = new Schema(consultantAvailabilitySchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ==================== Indexes ====================
consultantAvailabilitySchema.index({ tenantId: 1, availabilityId: 1 }, { unique: true });
consultantAvailabilitySchema.index({ tenantId: 1, consultantId: 1 });
consultantAvailabilitySchema.index({ tenantId: 1, consultantId: 1, 'period.startDate': 1, 'period.endDate': 1 });
consultantAvailabilitySchema.index({ tenantId: 1, type: 1 });
consultantAvailabilitySchema.index({ tenantId: 1, availabilityStatus: 1 });
consultantAvailabilitySchema.index({ tenantId: 1, 'timeOff.approvalStatus': 1 });
consultantAvailabilitySchema.index({ 'period.startDate': 1, 'period.endDate': 1 });

// ==================== Virtuals ====================
consultantAvailabilitySchema.virtual('durationDays').get(function() {
    if (!this.period.startDate || !this.period.endDate) return 0;
    const diff = this.period.endDate - this.period.startDate;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

consultantAvailabilitySchema.virtual('durationHours').get(function() {
    if (!this.period.startTime || !this.period.endTime) return null;
    const [startHour, startMin] = this.period.startTime.split(':').map(Number);
    const [endHour, endMin] = this.period.endTime.split(':').map(Number);
    return (endHour + endMin / 60) - (startHour + startMin / 60);
});

consultantAvailabilitySchema.virtual('isCurrentlyActive').get(function() {
    const now = new Date();
    return this.status.isActive && 
           this.period.startDate <= now && 
           this.period.endDate >= now;
});

consultantAvailabilitySchema.virtual('isPending').get(function() {
    return this.timeOff?.approvalStatus === 'pending';
});

// ==================== Pre-Save Middleware ====================
consultantAvailabilitySchema.pre('save', async function(next) {
    try {
        if (this.period.endDate < this.period.startDate) {
            throw new Error('End date cannot be before start date');
        }

        if (this.isNew && this.type === 'time_off' && !this.timeOff?.requestedAt) {
            this.timeOff = this.timeOff || {};
            this.timeOff.requestedAt = new Date();
        }

        next();
    } catch (error) {
        next(error);
    }
});

// ==================== Instance Methods ====================
consultantAvailabilitySchema.methods.approve = async function(approverId, notes = '') {
    if (this.timeOff) {
        this.timeOff.approvalStatus = 'approved';
        this.timeOff.approvedBy = approverId;
        this.timeOff.approvedAt = new Date();
    }
    
    if (notes) {
        this.metadata.notes = (this.metadata.notes || '') + '\nApproval notes: ' + notes;
    }

    return this.save();
};

consultantAvailabilitySchema.methods.reject = async function(rejectorId, reason) {
    if (this.timeOff) {
        this.timeOff.approvalStatus = 'rejected';
        this.timeOff.rejectionReason = reason;
    }
    
    return this.save();
};

consultantAvailabilitySchema.methods.cancel = async function(userId, reason) {
    this.status.current = 'cancelled';
    this.status.cancelledAt = new Date();
    this.status.cancelledBy = userId;
    this.status.cancellationReason = reason;

    if (this.timeOff) {
        this.timeOff.approvalStatus = 'cancelled';
    }

    return this.save();
};

consultantAvailabilitySchema.methods.addConflict = async function(conflictData) {
    this.conflicts.push({
        ...conflictData,
        resolution: 'pending'
    });
    return this.save();
};

consultantAvailabilitySchema.methods.resolveConflict = async function(conflictIndex, resolution, userId, notes) {
    if (this.conflicts[conflictIndex]) {
        this.conflicts[conflictIndex].resolution = resolution;
        this.conflicts[conflictIndex].resolvedBy = userId;
        this.conflicts[conflictIndex].resolvedAt = new Date();
        this.conflicts[conflictIndex].resolutionNotes = notes;
    }
    return this.save();
};

consultantAvailabilitySchema.methods.overlaps = function(startDate, endDate) {
    return (this.period.startDate <= endDate && this.period.endDate >= startDate);
};

// ==================== Static Methods ====================
consultantAvailabilitySchema.statics.findByConsultant = function(tenantId, consultantId, options = {}) {
    const query = {
        tenantId,
        consultantId,
        'status.isDeleted': false
    };

    if (options.type) query.type = options.type;
    if (options.status) query.availabilityStatus = options.status;
    if (options.startDate) query['period.endDate'] = { $gte: options.startDate };
    if (options.endDate) query['period.startDate'] = { $lte: options.endDate };
    if (options.approvalStatus) query['timeOff.approvalStatus'] = options.approvalStatus;

    return this.find(query).sort({ 'period.startDate': 1 });
};

consultantAvailabilitySchema.statics.findOverlapping = function(tenantId, consultantId, startDate, endDate, excludeId = null) {
    const query = {
        tenantId,
        consultantId,
        'status.isDeleted': false,
        'status.current': { $ne: 'cancelled' },
        'period.startDate': { $lt: endDate },
        'period.endDate': { $gt: startDate }
    };

    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    return this.find(query);
};

consultantAvailabilitySchema.statics.findPendingApprovals = function(tenantId, managerId = null) {
    const query = {
        tenantId,
        type: 'time_off',
        'timeOff.approvalStatus': 'pending',
        'status.isDeleted': false
    };

    return this.find(query)
        .populate('consultantId', 'profile.firstName profile.lastName consultantCode')
        .sort({ 'timeOff.requestedAt': 1 });
};

consultantAvailabilitySchema.statics.getCapacityReport = function(tenantId, startDate, endDate) {
    return this.aggregate([
        { $match: {
            tenantId: new mongoose.Types.ObjectId(tenantId),
            'status.isDeleted': false,
            'status.current': { $in: ['active', 'completed'] },
            'period.startDate': { $lte: endDate },
            'period.endDate': { $gte: startDate }
        }},
        { $group: {
            _id: '$consultantId',
            totalDaysOff: {
                $sum: {
                    $divide: [
                        { $subtract: ['$period.endDate', '$period.startDate'] },
                        1000 * 60 * 60 * 24
                    ]
                }
            },
            unavailableRecords: { $sum: 1 },
            byType: {
                $push: {
                    type: '$type',
                    days: {
                        $divide: [
                            { $subtract: ['$period.endDate', '$period.startDate'] },
                            1000 * 60 * 60 * 24
                        ]
                    }
                }
            }
        }},
        { $lookup: {
            from: 'consultants',
            localField: '_id',
            foreignField: '_id',
            as: 'consultant'
        }},
        { $unwind: '$consultant' }
    ]);
};

consultantAvailabilitySchema.statics.getTimeOffBalance = async function(tenantId, consultantId, year) {
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    const result = await this.aggregate([
        { $match: {
            tenantId: new mongoose.Types.ObjectId(tenantId),
            consultantId: new mongoose.Types.ObjectId(consultantId),
            type: 'time_off',
            'timeOff.approvalStatus': { $in: ['approved', 'pending'] },
            'status.isDeleted': false,
            'period.startDate': { $gte: startOfYear, $lte: endOfYear }
        }},
        { $group: {
            _id: '$timeOff.reason',
            totalDays: {
                $sum: {
                    $divide: [
                        { $subtract: ['$period.endDate', '$period.startDate'] },
                        1000 * 60 * 60 * 24
                    ]
                }
            },
            totalHours: { $sum: '$timeOff.hoursUsed' },
            count: { $sum: 1 }
        }}
    ]);

    return result;
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
    schema: consultantAvailabilitySchema,
    modelName: 'ConsultantAvailability',
    createModel: function(connection) {
        if (connection) {
            return connection.model('ConsultantAvailability', consultantAvailabilitySchema);
        }
        return mongoose.model('ConsultantAvailability', consultantAvailabilitySchema);
    }
};

module.exports.ConsultantAvailability = mongoose.model('ConsultantAvailability', consultantAvailabilitySchema);
module.exports.consultantAvailabilitySchema = consultantAvailabilitySchema;