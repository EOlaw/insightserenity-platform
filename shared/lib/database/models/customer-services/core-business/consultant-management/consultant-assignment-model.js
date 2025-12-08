'use strict';

/**
 * @fileoverview Consultant Assignment Model - Project and engagement assignment tracking
 * @module shared/lib/database/models/customer-services/core-business/consultant-management/consultant-assignment-model
 * @description Manages consultant assignments to projects, clients, and engagements with detailed tracking
 * @requires mongoose
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const logger = require('../../../../../utils/logger');

/**
 * Consultant Assignment Schema Definition
 * Tracks consultant allocations to projects, clients, and engagements
 */
const consultantAssignmentSchemaDefinition = {
    // ==================== Core Identity ====================
    assignmentId: {
        type: String,
        unique: true,
        required: true,
        uppercase: true,
        match: /^ASN-[A-Z0-9-]+$/,
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

    // ==================== Primary Relationships ====================
    consultantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consultant',
        required: true,
        index: true
    },

    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        index: true
    },

    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        index: true
    },

    engagementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Engagement',
        index: true
    },

    // ==================== Assignment Details ====================
    details: {
        title: {
            type: String,
            trim: true,
            maxlength: 200
        },
        description: {
            type: String,
            maxlength: 5000
        },
        role: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        roleLevel: {
            type: String,
            enum: ['junior', 'mid', 'senior', 'lead', 'principal', 'director', 'partner']
        },
        responsibilities: [{
            type: String,
            trim: true
        }],
        deliverables: [{
            name: String,
            description: String,
            dueDate: Date,
            status: {
                type: String,
                enum: ['pending', 'in_progress', 'completed', 'delayed', 'cancelled']
            },
            completedAt: Date
        }],
        workLocation: {
            type: String,
            enum: ['remote', 'on_site', 'hybrid', 'client_site', 'flexible']
        },
        reportingTo: {
            consultantId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Consultant'
            },
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            name: String,
            title: String
        },
        teamMembers: [{
            consultantId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Consultant'
            },
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            name: String,
            role: String
        }]
    },

    // ==================== Timeline ====================
    timeline: {
        proposedStart: Date,
        proposedEnd: Date,
        actualStart: Date,
        actualEnd: Date,
        estimatedDuration: {
            value: Number,
            unit: {
                type: String,
                enum: ['days', 'weeks', 'months']
            }
        },
        extensions: [{
            originalEndDate: Date,
            newEndDate: Date,
            reason: String,
            requestedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            requestedAt: Date,
            approvedAt: Date,
            status: {
                type: String,
                enum: ['pending', 'approved', 'rejected']
            }
        }],
        milestones: [{
            name: String,
            description: String,
            targetDate: Date,
            actualDate: Date,
            status: {
                type: String,
                enum: ['pending', 'in_progress', 'completed', 'missed']
            }
        }]
    },

    // ==================== Allocation ====================
    allocation: {
        percentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            default: 100
        },
        hoursPerWeek: {
            type: Number,
            min: 0,
            max: 80
        },
        hoursPerDay: {
            type: Number,
            min: 0,
            max: 24
        },
        schedule: [{
            dayOfWeek: {
                type: Number,
                min: 0,
                max: 6
            },
            hours: Number,
            startTime: String,
            endTime: String
        }],
        flexibleHours: {
            type: Boolean,
            default: false
        },
        minimumHours: Number,
        maximumHours: Number,
        actualUtilization: {
            type: Number,
            min: 0,
            max: 100
        }
    },

    // ==================== Billing & Rates ====================
    billing: {
        billable: {
            type: Boolean,
            default: true
        },
        rateType: {
            type: String,
            enum: ['hourly', 'daily', 'weekly', 'monthly', 'fixed', 'milestone'],
            default: 'hourly'
        },
        rate: {
            amount: {
                type: Number,
                min: 0
            },
            currency: {
                type: String,
                default: 'USD'
            }
        },
        clientRate: {
            amount: Number,
            currency: String
        },
        costRate: {
            amount: Number,
            currency: String
        },
        margin: {
            percentage: Number,
            amount: Number
        },
        overtime: {
            allowed: Boolean,
            rate: Number,
            multiplier: Number,
            maxHours: Number
        },
        budget: {
            allocated: Number,
            spent: Number,
            remaining: Number,
            currency: String
        },
        expenses: {
            allowed: Boolean,
            limit: Number,
            spent: Number,
            categories: [{
                type: String,
                enum: ['travel', 'accommodation', 'meals', 'equipment', 'software', 'other']
            }]
        },
        invoicingSchedule: {
            type: String,
            enum: ['weekly', 'bi_weekly', 'monthly', 'milestone', 'on_completion']
        }
    },

    // ==================== Time Tracking ====================
    timeTracking: {
        totalHoursLogged: {
            type: Number,
            default: 0
        },
        billableHoursLogged: {
            type: Number,
            default: 0
        },
        nonBillableHoursLogged: {
            type: Number,
            default: 0
        },
        estimatedHours: {
            type: Number,
            min: 0
        },
        remainingHours: Number,
        varianceHours: Number,
        lastTimeEntry: Date,
        timesheetSummary: [{
            period: {
                start: Date,
                end: Date
            },
            hoursLogged: Number,
            billableHours: Number,
            status: {
                type: String,
                enum: ['draft', 'submitted', 'approved', 'rejected', 'invoiced']
            }
        }]
    },

    // ==================== Performance ====================
    performance: {
        clientSatisfaction: {
            rating: {
                type: Number,
                min: 1,
                max: 5
            },
            feedback: String,
            ratedAt: Date,
            ratedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        },
        projectManagerRating: {
            rating: {
                type: Number,
                min: 1,
                max: 5
            },
            feedback: String,
            categories: {
                quality: Number,
                timeliness: Number,
                communication: Number,
                collaboration: Number,
                initiative: Number
            },
            ratedAt: Date,
            ratedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        },
        selfAssessment: {
            rating: Number,
            feedback: String,
            achievements: [String],
            challenges: [String],
            lessonsLearned: [String],
            submittedAt: Date
        },
        kpis: [{
            name: String,
            target: Number,
            actual: Number,
            unit: String,
            achievedAt: Date
        }]
    },

    // ==================== Status & Workflow ====================
    status: {
        current: {
            type: String,
            enum: ['proposed', 'pending_approval', 'confirmed', 'active', 'on_hold', 'completed', 'cancelled', 'terminated'],
            default: 'proposed',
            index: true
        },
        history: [{
            status: String,
            changedAt: Date,
            changedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            reason: String,
            notes: String
        }],
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
        }
    },

    // ==================== Approval Workflow ====================
    approval: {
        required: {
            type: Boolean,
            default: true
        },
        levels: [{
            level: Number,
            approver: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            role: String,
            status: {
                type: String,
                enum: ['pending', 'approved', 'rejected', 'skipped']
            },
            decision: String,
            decidedAt: Date,
            comments: String
        }],
        currentLevel: Number,
        finalApproval: {
            approved: Boolean,
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            approvedAt: Date
        },
        rejectionReason: String
    },

    // ==================== Transition & Offboarding ====================
    transition: {
        handover: {
            required: Boolean,
            completed: Boolean,
            completedAt: Date,
            handoverTo: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Consultant'
            },
            documentation: [{
                title: String,
                url: String,
                type: String
            }],
            notes: String
        },
        exitInterview: {
            completed: Boolean,
            completedAt: Date,
            conductedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            feedback: String,
            wouldReengage: Boolean
        },
        clientFeedback: {
            collected: Boolean,
            collectedAt: Date,
            rating: Number,
            feedback: String,
            wouldRehire: Boolean,
            recommendations: [String]
        }
    },

    // ==================== Documents & Attachments ====================
    documents: [{
        documentId: String,
        type: {
            type: String,
            enum: ['sow', 'contract', 'nda', 'change_order', 'timesheet', 'expense_report', 'deliverable', 'report', 'other']
        },
        name: String,
        description: String,
        url: String,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        uploadedAt: Date,
        version: Number,
        status: {
            type: String,
            enum: ['draft', 'pending_review', 'approved', 'superseded']
        }
    }],

    // ==================== Notes & Communications ====================
    notes: [{
        noteId: String,
        type: {
            type: String,
            enum: ['general', 'status_update', 'issue', 'risk', 'decision', 'action_item']
        },
        content: String,
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical']
        },
        visibility: {
            type: String,
            enum: ['private', 'internal', 'client_visible']
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: Date,
        resolvedAt: Date,
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],

    // ==================== Metadata ====================
    metadata: {
        source: {
            type: String,
            enum: ['manual', 'staffing_request', 'resource_planning', 'extension', 'rollover', 'api', 'import']
        },
        staffingRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'StaffingRequest'
        },
        previousAssignmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ConsultantAssignment'
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        externalIds: {
            projectManagement: String,
            timeTracking: String,
            billing: String
        },
        tags: [{
            type: String
        }]
    }
};

const consultantAssignmentSchema = new Schema(consultantAssignmentSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ==================== Indexes ====================
consultantAssignmentSchema.index({ tenantId: 1, assignmentId: 1 }, { unique: true });
consultantAssignmentSchema.index({ tenantId: 1, consultantId: 1 });
consultantAssignmentSchema.index({ tenantId: 1, projectId: 1 });
consultantAssignmentSchema.index({ tenantId: 1, clientId: 1 });
consultantAssignmentSchema.index({ tenantId: 1, 'status.current': 1 });
consultantAssignmentSchema.index({ tenantId: 1, consultantId: 1, 'status.current': 1 });
consultantAssignmentSchema.index({ tenantId: 1, 'timeline.actualStart': 1, 'timeline.actualEnd': 1 });
consultantAssignmentSchema.index({ 'details.role': 1 });
consultantAssignmentSchema.index({ 'billing.billable': 1 });

// ==================== Virtuals ====================
consultantAssignmentSchema.virtual('durationDays').get(function() {
    const start = this.timeline.actualStart || this.timeline.proposedStart;
    const end = this.timeline.actualEnd || this.timeline.proposedEnd;
    if (!start || !end) return 0;
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
});

consultantAssignmentSchema.virtual('isOverdue').get(function() {
    const expectedEnd = this.timeline.actualEnd || this.timeline.proposedEnd;
    return this.status.current === 'active' && expectedEnd < new Date();
});

consultantAssignmentSchema.virtual('utilizationPercentage').get(function() {
    if (!this.timeTracking.estimatedHours || this.timeTracking.estimatedHours === 0) return 0;
    return Math.round((this.timeTracking.totalHoursLogged / this.timeTracking.estimatedHours) * 100);
});

consultantAssignmentSchema.virtual('budgetUtilization').get(function() {
    if (!this.billing.budget?.allocated || this.billing.budget.allocated === 0) return 0;
    return Math.round(((this.billing.budget.spent || 0) / this.billing.budget.allocated) * 100);
});

consultantAssignmentSchema.virtual('effectiveRate').get(function() {
    const hours = this.timeTracking.billableHoursLogged || 0;
    const revenue = (this.billing.clientRate?.amount || 0) * hours;
    const cost = (this.billing.costRate?.amount || 0) * hours;
    if (cost === 0) return 0;
    return ((revenue - cost) / cost) * 100;
});

// ==================== Pre-Save Middleware ====================
consultantAssignmentSchema.pre('save', async function(next) {
    try {
        if (this.isModified('status.current') && this.status.current !== this._original?.status?.current) {
            this.status.history.push({
                status: this.status.current,
                changedAt: new Date(),
                changedBy: this.metadata?.updatedBy,
                reason: 'Status change'
            });
        }

        if (this.timeTracking) {
            this.timeTracking.remainingHours = (this.timeTracking.estimatedHours || 0) - (this.timeTracking.totalHoursLogged || 0);
            this.timeTracking.varianceHours = (this.timeTracking.estimatedHours || 0) - (this.timeTracking.totalHoursLogged || 0);
        }

        if (this.billing.budget) {
            this.billing.budget.remaining = (this.billing.budget.allocated || 0) - (this.billing.budget.spent || 0);
        }

        next();
    } catch (error) {
        next(error);
    }
});

// ==================== Instance Methods ====================
consultantAssignmentSchema.methods.activate = async function(userId) {
    this.status.current = 'active';
    this.timeline.actualStart = this.timeline.actualStart || new Date();
    this.metadata.updatedBy = userId;
    return this.save();
};

consultantAssignmentSchema.methods.complete = async function(userId, feedback = {}) {
    this.status.current = 'completed';
    this.timeline.actualEnd = new Date();
    
    if (feedback.clientSatisfaction) {
        this.performance.clientSatisfaction = {
            rating: feedback.clientSatisfaction.rating,
            feedback: feedback.clientSatisfaction.feedback,
            ratedAt: new Date(),
            ratedBy: userId
        };
    }

    this.metadata.updatedBy = userId;
    return this.save();
};

consultantAssignmentSchema.methods.extend = async function(newEndDate, reason, requesterId) {
    this.timeline.extensions.push({
        originalEndDate: this.timeline.proposedEnd || this.timeline.actualEnd,
        newEndDate,
        reason,
        requestedBy: requesterId,
        requestedAt: new Date(),
        status: 'pending'
    });

    this.timeline.proposedEnd = newEndDate;
    this.metadata.updatedBy = requesterId;
    return this.save();
};

consultantAssignmentSchema.methods.logTime = async function(hours, billable = true, date = new Date()) {
    this.timeTracking.totalHoursLogged = (this.timeTracking.totalHoursLogged || 0) + hours;
    
    if (billable) {
        this.timeTracking.billableHoursLogged = (this.timeTracking.billableHoursLogged || 0) + hours;
    } else {
        this.timeTracking.nonBillableHoursLogged = (this.timeTracking.nonBillableHoursLogged || 0) + hours;
    }

    this.timeTracking.lastTimeEntry = date;

    if (billable && this.billing.clientRate?.amount) {
        this.billing.budget.spent = (this.billing.budget.spent || 0) + (hours * this.billing.clientRate.amount);
    }

    return this.save();
};

consultantAssignmentSchema.methods.addNote = async function(noteData, userId) {
    this.notes.push({
        noteId: `NOTE-${Date.now()}`,
        ...noteData,
        createdBy: userId,
        createdAt: new Date()
    });
    return this.save();
};

consultantAssignmentSchema.methods.approve = async function(approverId, level, comments = '') {
    const approvalLevel = this.approval.levels.find(l => l.level === level);
    if (approvalLevel) {
        approvalLevel.status = 'approved';
        approvalLevel.decidedAt = new Date();
        approvalLevel.comments = comments;
    }

    const allApproved = this.approval.levels.every(l => l.status === 'approved');
    if (allApproved) {
        this.approval.finalApproval = {
            approved: true,
            approvedBy: approverId,
            approvedAt: new Date()
        };
        this.status.current = 'confirmed';
    } else {
        this.approval.currentLevel = level + 1;
    }

    return this.save();
};

consultantAssignmentSchema.methods.reject = async function(rejectorId, level, reason) {
    const approvalLevel = this.approval.levels.find(l => l.level === level);
    if (approvalLevel) {
        approvalLevel.status = 'rejected';
        approvalLevel.decidedAt = new Date();
        approvalLevel.comments = reason;
    }

    this.approval.rejectionReason = reason;
    this.status.current = 'cancelled';

    return this.save();
};

// ==================== Static Methods ====================
consultantAssignmentSchema.statics.findByConsultant = function(tenantId, consultantId, options = {}) {
    const query = {
        tenantId,
        consultantId,
        'status.isDeleted': false
    };

    if (options.status) query['status.current'] = options.status;
    if (options.active) query['status.current'] = { $in: ['active', 'confirmed'] };
    if (options.clientId) query.clientId = options.clientId;
    if (options.projectId) query.projectId = options.projectId;

    return this.find(query)
        .populate('clientId', 'companyName clientCode')
        .populate('projectId', 'name projectCode')
        .sort({ 'timeline.actualStart': -1 });
};

consultantAssignmentSchema.statics.findByProject = function(tenantId, projectId, options = {}) {
    const query = {
        tenantId,
        projectId,
        'status.isDeleted': false
    };

    if (options.status) query['status.current'] = options.status;

    return this.find(query)
        .populate('consultantId', 'profile.firstName profile.lastName consultantCode')
        .sort({ 'allocation.percentage': -1 });
};

consultantAssignmentSchema.statics.findByClient = function(tenantId, clientId, options = {}) {
    const query = {
        tenantId,
        clientId,
        'status.isDeleted': false
    };

    if (options.status) query['status.current'] = options.status;
    if (options.active) query['status.current'] = { $in: ['active', 'confirmed'] };

    return this.find(query)
        .populate('consultantId', 'profile.firstName profile.lastName consultantCode professional.level')
        .populate('projectId', 'name projectCode')
        .sort({ 'timeline.actualStart': -1 });
};

consultantAssignmentSchema.statics.getCurrentAllocation = async function(tenantId, consultantId) {
    const activeAssignments = await this.find({
        tenantId,
        consultantId,
        'status.current': { $in: ['active', 'confirmed'] },
        'status.isDeleted': false
    });

    return activeAssignments.reduce((total, assignment) => 
        total + (assignment.allocation.percentage || 0), 0);
};

consultantAssignmentSchema.statics.getUtilizationReport = function(tenantId, startDate, endDate, options = {}) {
    const matchStage = {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        'status.isDeleted': false,
        'status.current': { $in: ['active', 'completed'] },
        $or: [
            { 'timeline.actualStart': { $lte: endDate, $gte: startDate } },
            { 'timeline.actualEnd': { $lte: endDate, $gte: startDate } },
            { $and: [
                { 'timeline.actualStart': { $lte: startDate } },
                { 'timeline.actualEnd': { $gte: endDate } }
            ]}
        ]
    };

    if (options.consultantId) {
        matchStage.consultantId = new mongoose.Types.ObjectId(options.consultantId);
    }

    return this.aggregate([
        { $match: matchStage },
        { $group: {
            _id: '$consultantId',
            totalAssignments: { $sum: 1 },
            totalBillableHours: { $sum: '$timeTracking.billableHoursLogged' },
            totalNonBillableHours: { $sum: '$timeTracking.nonBillableHoursLogged' },
            averageAllocation: { $avg: '$allocation.percentage' },
            averageClientRating: { $avg: '$performance.clientSatisfaction.rating' },
            clients: { $addToSet: '$clientId' },
            projects: { $addToSet: '$projectId' }
        }},
        { $lookup: {
            from: 'consultants',
            localField: '_id',
            foreignField: '_id',
            as: 'consultant'
        }},
        { $unwind: '$consultant' },
        { $project: {
            consultantId: '$_id',
            consultantName: { $concat: ['$consultant.profile.firstName', ' ', '$consultant.profile.lastName'] },
            consultantCode: '$consultant.consultantCode',
            totalAssignments: 1,
            totalBillableHours: 1,
            totalNonBillableHours: 1,
            totalHours: { $add: ['$totalBillableHours', '$totalNonBillableHours'] },
            averageAllocation: 1,
            averageClientRating: 1,
            uniqueClients: { $size: '$clients' },
            uniqueProjects: { $size: '$projects' }
        }}
    ]);
};

consultantAssignmentSchema.statics.getRevenueReport = function(tenantId, startDate, endDate) {
    return this.aggregate([
        { $match: {
            tenantId: new mongoose.Types.ObjectId(tenantId),
            'status.isDeleted': false,
            'billing.billable': true,
            $or: [
                { 'timeline.actualStart': { $lte: endDate, $gte: startDate } },
                { 'timeline.actualEnd': { $lte: endDate, $gte: startDate } }
            ]
        }},
        { $group: {
            _id: {
                clientId: '$clientId',
                month: { $month: '$timeline.actualStart' },
                year: { $year: '$timeline.actualStart' }
            },
            revenue: {
                $sum: {
                    $multiply: ['$timeTracking.billableHoursLogged', '$billing.clientRate.amount']
                }
            },
            cost: {
                $sum: {
                    $multiply: ['$timeTracking.billableHoursLogged', '$billing.costRate.amount']
                }
            },
            hours: { $sum: '$timeTracking.billableHoursLogged' },
            assignmentCount: { $sum: 1 }
        }},
        { $addFields: {
            margin: { $subtract: ['$revenue', '$cost'] },
            marginPercentage: {
                $cond: [
                    { $eq: ['$revenue', 0] },
                    0,
                    { $multiply: [{ $divide: [{ $subtract: ['$revenue', '$cost'] }, '$revenue'] }, 100] }
                ]
            }
        }},
        { $lookup: {
            from: 'clients',
            localField: '_id.clientId',
            foreignField: '_id',
            as: 'client'
        }},
        { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
        { $sort: { '_id.year': -1, '_id.month': -1, 'revenue': -1 } }
    ]);
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
    schema: consultantAssignmentSchema,
    modelName: 'ConsultantAssignment',
    createModel: function(connection) {
        if (connection) {
            return connection.model('ConsultantAssignment', consultantAssignmentSchema);
        }
        return mongoose.model('ConsultantAssignment', consultantAssignmentSchema);
    }
};

module.exports.ConsultantAssignment = mongoose.model('ConsultantAssignment', consultantAssignmentSchema);
module.exports.consultantAssignmentSchema = consultantAssignmentSchema;