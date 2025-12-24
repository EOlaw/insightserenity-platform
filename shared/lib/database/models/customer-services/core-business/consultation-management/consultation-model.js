'use strict';

/**
 * @fileoverview Consultation Model - Individual consulting sessions and engagements
 * @module shared/lib/database/models/customer-services/core-business/consultant-management/consultation-model
 * @description Manages individual consulting sessions between consultants and clients, tracking scheduling,
 * deliverables, outcomes, and feedback for each consulting engagement
 * @requires mongoose
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const logger = require('../../../../../utils/logger');

/**
 * Consultation Schema Definition
 * Represents individual consulting sessions/meetings between consultants and clients
 */
const consultationSchemaDefinition = {
    // ==================== Core Identity ====================
    consultationId: {
        type: String,
        unique: true,
        required: true,
        uppercase: true,
        match: /^CONS-[A-Z0-9-]+$/,
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

    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        index: true
    },

    // Optional: Link to broader assignment/project
    assignmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ConsultantAssignment',
        index: true
    },

    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        index: true
    },

    engagementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Engagement',
        index: true
    },

    // ==================== Consultation Details ====================
    details: {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
            index: true
        },
        description: {
            type: String,
            maxlength: 5000
        },
        type: {
            type: String,
            enum: [
                'strategy_session',
                'technical_consultation',
                'advisory',
                'training',
                'workshop',
                'review',
                'status_update',
                'planning',
                'implementation',
                'troubleshooting',
                'assessment',
                'other'
            ],
            required: true,
            index: true
        },
        category: {
            type: String,
            enum: ['discovery', 'design', 'delivery', 'support', 'review', 'follow_up'],
            index: true
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent'],
            default: 'medium'
        },
        objectives: [{
            description: String,
            achieved: Boolean,
            notes: String
        }],
        agenda: [{
            topic: String,
            duration: Number,
            presenter: String,
            notes: String,
            completed: Boolean
        }],
        attendees: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            name: String,
            role: String,
            organization: String,
            attendance: {
                type: String,
                enum: ['required', 'optional', 'informational']
            },
            attended: Boolean,
            responseStatus: {
                type: String,
                enum: ['pending', 'accepted', 'declined', 'tentative']
            }
        }],
        location: {
            type: {
                type: String,
                enum: ['on_site', 'remote', 'hybrid', 'client_site', 'consultant_office']
            },
            address: {
                street1: String,
                street2: String,
                city: String,
                state: String,
                postalCode: String,
                country: String
            },
            virtualMeeting: {
                platform: String,
                meetingUrl: String,
                meetingId: String,
                passcode: String,
                dialInNumber: String
            },
            timezone: String,
            notes: String
        }
    },

    // ==================== Scheduling ====================
    schedule: {
        scheduledStart: {
            type: Date,
            required: true,
            index: true
        },
        scheduledEnd: {
            type: Date,
            required: true
        },
        actualStart: Date,
        actualEnd: Date,
        duration: {
            scheduled: {
                type: Number,
                min: 0
            },
            actual: Number
        },
        timezone: {
            type: String,
            default: 'UTC'
        },
        isRecurring: {
            type: Boolean,
            default: false
        },
        recurrence: {
            pattern: {
                type: String,
                enum: ['daily', 'weekly', 'monthly', 'custom']
            },
            interval: Number,
            daysOfWeek: [Number],
            endDate: Date,
            occurrences: Number
        },
        parentConsultationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Consultation'
        },
        seriesId: String,
        reminders: [{
            type: {
                type: String,
                enum: ['email', 'sms', 'notification', 'calendar']
            },
            minutesBefore: Number,
            sent: Boolean,
            sentAt: Date
        }],
        rescheduled: {
            type: Boolean,
            default: false
        },
        rescheduleHistory: [{
            originalStart: Date,
            originalEnd: Date,
            newStart: Date,
            newEnd: Date,
            reason: String,
            requestedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            requestedAt: Date
        }]
    },

    // ==================== Session Content ====================
    content: {
        summary: String,
        keyDiscussions: [{
            topic: String,
            details: String,
            participants: [String],
            timestamp: Date
        }],
        decisions: [{
            decision: String,
            rationale: String,
            impact: String,
            decidedBy: String,
            implementationDate: Date
        }],
        actionItems: [{
            actionItemId: String,
            description: {
                type: String,
                required: true
            },
            assignedTo: {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User'
                },
                name: String
            },
            dueDate: Date,
            priority: {
                type: String,
                enum: ['low', 'medium', 'high', 'critical']
            },
            status: {
                type: String,
                enum: ['pending', 'in_progress', 'completed', 'cancelled', 'blocked'],
                default: 'pending'
            },
            completedAt: Date,
            notes: String
        }],
        risks: [{
            description: String,
            severity: {
                type: String,
                enum: ['low', 'medium', 'high', 'critical']
            },
            likelihood: {
                type: String,
                enum: ['low', 'medium', 'high']
            },
            mitigation: String,
            owner: String
        }],
        issues: [{
            description: String,
            severity: {
                type: String,
                enum: ['minor', 'moderate', 'major', 'critical']
            },
            status: {
                type: String,
                enum: ['open', 'in_progress', 'resolved', 'closed']
            },
            resolution: String,
            resolvedAt: Date
        }],
        recommendations: [{
            recommendation: String,
            rationale: String,
            expectedOutcome: String,
            priority: String,
            implementationTimeframe: String
        }]
    },

    // ==================== Deliverables ====================
    deliverables: [{
        deliverableId: String,
        name: {
            type: String,
            required: true
        },
        description: String,
        type: {
            type: String,
            enum: ['document', 'presentation', 'report', 'code', 'analysis', 'plan', 'design', 'prototype', 'other']
        },
        dueDate: Date,
        completedDate: Date,
        status: {
            type: String,
            enum: ['not_started', 'in_progress', 'review', 'completed', 'delivered', 'approved', 'rejected'],
            default: 'not_started'
        },
        files: [{
            name: String,
            url: String,
            mimeType: String,
            size: Number,
            version: String,
            uploadedAt: Date,
            uploadedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        }],
        approvals: [{
            approver: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            status: {
                type: String,
                enum: ['pending', 'approved', 'rejected', 'changes_requested']
            },
            comments: String,
            decidedAt: Date
        }],
        qualityMetrics: {
            completeness: Number,
            accuracy: Number,
            timeliness: Number,
            clientSatisfaction: Number
        }
    }],

    // ==================== Outcomes & Results ====================
    outcomes: {
        overallStatus: {
            type: String,
            enum: ['successful', 'partially_successful', 'unsuccessful', 'cancelled', 'postponed'],
            index: true
        },
        objectivesMetPercentage: {
            type: Number,
            min: 0,
            max: 100
        },
        keyAchievements: [String],
        challenges: [String],
        lessonsLearned: [String],
        nextSteps: [String],
        followUpRequired: {
            type: Boolean,
            default: false
        },
        followUpDate: Date,
        followUpConsultationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Consultation'
        },
        metrics: {
            clientSatisfaction: {
                type: Number,
                min: 1,
                max: 5
            },
            valueDelivered: {
                type: Number,
                min: 1,
                max: 5
            },
            knowledgeTransfer: {
                type: Number,
                min: 1,
                max: 5
            },
            problemResolution: {
                type: Number,
                min: 1,
                max: 5
            }
        },
        impact: {
            immediate: String,
            shortTerm: String,
            longTerm: String,
            measurableResults: [String]
        }
    },

    // ==================== Feedback & Ratings ====================
    feedback: {
        consultant: {
            feedback: String,
            rating: {
                type: Number,
                min: 1,
                max: 5
            },
            strengths: [String],
            areasForImprovement: [String],
            wouldRecommend: Boolean,
            submittedAt: Date
        },
        client: {
            feedback: String,
            rating: {
                type: Number,
                min: 1,
                max: 5
            },
            categories: {
                expertise: Number,
                communication: Number,
                professionalism: Number,
                valueDelivered: Number,
                responsiveness: Number
            },
            testimonial: String,
            allowPublicUse: Boolean,
            submittedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            submittedAt: Date
        },
        internal: {
            feedback: String,
            quality: {
                type: Number,
                min: 1,
                max: 5
            },
            efficiency: {
                type: Number,
                min: 1,
                max: 5
            },
            collaboration: {
                type: Number,
                min: 1,
                max: 5
            },
            reviewedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            reviewedAt: Date
        }
    },

    // ==================== Time & Billing ====================
    billing: {
        billable: {
            type: Boolean,
            default: true
        },
        rateType: {
            type: String,
            enum: ['hourly', 'flat_fee', 'included_in_retainer', 'complimentary'],
            default: 'hourly'
        },
        rate: {
            amount: Number,
            currency: {
                type: String,
                default: 'USD'
            }
        },
        estimatedCost: Number,
        actualCost: Number,
        invoiced: {
            type: Boolean,
            default: false
        },
        invoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Invoice'
        },
        invoiceDate: Date,
        paidDate: Date,
        expenses: [{
            type: String,
            description: String,
            amount: Number,
            currency: String,
            category: String,
            receiptUrl: String,
            approved: Boolean,
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            approvedAt: Date
        }],
        discount: {
            type: String,
            amount: Number,
            reason: String
        }
    },

    // ==================== Preparation & Materials ====================
    preparation: {
        preMeetingMaterials: [{
            name: String,
            description: String,
            url: String,
            type: String,
            sharedWith: [String],
            sharedAt: Date
        }],
        requiredPreWork: [{
            task: String,
            assignedTo: String,
            dueDate: Date,
            completed: Boolean,
            completedAt: Date
        }],
        backgroundInformation: String,
        previousConsultations: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Consultation'
        }],
        relatedDocuments: [{
            documentId: String,
            name: String,
            url: String,
            type: String
        }]
    },

    // ==================== Recording & Documentation ====================
    documentation: {
        recordingAllowed: {
            type: Boolean,
            default: false
        },
        recordingConsent: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            consented: Boolean,
            consentedAt: Date
        }],
        recordings: [{
            type: String,
            url: String,
            duration: Number,
            format: String,
            size: Number,
            uploadedAt: Date,
            expiresAt: Date,
            transcriptUrl: String
        }],
        minutes: {
            url: String,
            preparedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            distributedAt: Date
        },
        notes: [{
            content: String,
            type: {
                type: String,
                enum: ['general', 'technical', 'action', 'decision', 'private']
            },
            createdBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            visibility: {
                type: String,
                enum: ['public', 'internal', 'private']
            },
            createdAt: Date
        }],
        attachments: [{
            name: String,
            url: String,
            type: String,
            size: Number,
            uploadedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            uploadedAt: Date
        }]
    },

    // ==================== Status & Lifecycle ====================
    status: {
        current: {
            type: String,
            enum: [
                'scheduled',
                'confirmed',
                'in_progress',
                'completed',
                'cancelled',
                'postponed',
                'no_show',
                'rescheduled'
            ],
            default: 'scheduled',
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
        cancellation: {
            reason: String,
            cancelledBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            cancelledAt: Date,
            refundIssued: Boolean,
            refundAmount: Number
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
        }
    },

    // ==================== Notifications & Communication ====================
    notifications: {
        confirmationSent: {
            type: Boolean,
            default: false
        },
        confirmationSentAt: Date,
        remindersSent: [{
            type: String,
            sentAt: Date,
            recipients: [String]
        }],
        followUpSent: {
            type: Boolean,
            default: false
        },
        followUpSentAt: Date,
        feedbackRequestSent: {
            type: Boolean,
            default: false
        },
        feedbackRequestSentAt: Date
    },

    // ==================== Integration & External Systems ====================
    integrations: {
        calendarEventId: String,
        calendarProvider: {
            type: String,
            enum: ['google', 'outlook', 'apple', 'other']
        },
        videoConferenceId: String,
        videoConferenceProvider: String,
        crmActivityId: String,
        projectManagementTaskId: String,
        externalIds: {
            type: Map,
            of: String
        }
    },

    // ==================== Metadata ====================
    metadata: {
        source: {
            type: String,
            enum: ['manual', 'calendar', 'automated', 'api', 'import', 'recurring']
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
        tags: [{
            type: String
        }],
        customFields: {
            type: Map,
            of: mongoose.Schema.Types.Mixed
        },
        version: {
            type: Number,
            default: 1
        }
    },

    // ==================== Search Optimization ====================
    searchTokens: {
        type: [String],
        select: false
    }
};

const consultationSchema = new Schema(consultationSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ==================== Indexes ====================
consultationSchema.index({ tenantId: 1, consultationId: 1 }, { unique: true });
consultationSchema.index({ tenantId: 1, consultantId: 1 });
consultationSchema.index({ tenantId: 1, clientId: 1 });
consultationSchema.index({ tenantId: 1, assignmentId: 1 });
consultationSchema.index({ tenantId: 1, projectId: 1 });
consultationSchema.index({ tenantId: 1, 'status.current': 1 });
consultationSchema.index({ tenantId: 1, 'schedule.scheduledStart': 1 });
consultationSchema.index({ tenantId: 1, consultantId: 1, 'schedule.scheduledStart': 1 });
consultationSchema.index({ tenantId: 1, clientId: 1, 'schedule.scheduledStart': 1 });
consultationSchema.index({ tenantId: 1, 'details.type': 1 });
consultationSchema.index({ 'schedule.seriesId': 1 });
consultationSchema.index({ searchTokens: 1 });

// Text search index
consultationSchema.index({
    'details.title': 'text',
    'details.description': 'text',
    'content.summary': 'text'
});

// ==================== Virtuals ====================
consultationSchema.virtual('isUpcoming').get(function() {
    return this.status.current === 'scheduled' &&
           this.schedule.scheduledStart > new Date();
});

consultationSchema.virtual('isPast').get(function() {
    return this.status.current === 'completed' ||
           (this.schedule.scheduledEnd && this.schedule.scheduledEnd < new Date());
});

consultationSchema.virtual('isInProgress').get(function() {
    return this.status.current === 'in_progress';
});

consultationSchema.virtual('durationMinutes').get(function() {
    if (this.schedule.actualStart && this.schedule.actualEnd) {
        return Math.round((this.schedule.actualEnd - this.schedule.actualStart) / (1000 * 60));
    }
    if (this.schedule.scheduledStart && this.schedule.scheduledEnd) {
        return Math.round((this.schedule.scheduledEnd - this.schedule.scheduledStart) / (1000 * 60));
    }
    return this.schedule.duration?.scheduled || 0;
});

consultationSchema.virtual('timeUntilStart').get(function() {
    if (this.schedule.scheduledStart > new Date()) {
        return Math.round((this.schedule.scheduledStart - new Date()) / (1000 * 60));
    }
    return 0;
});

consultationSchema.virtual('overallRating').get(function() {
    const ratings = [
        this.feedback.client?.rating,
        this.feedback.consultant?.rating,
        this.feedback.internal?.quality
    ].filter(r => r !== undefined && r !== null);

    if (ratings.length === 0) return null;
    return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
});

consultationSchema.virtual('completionPercentage').get(function() {
    if (!this.deliverables || this.deliverables.length === 0) return 100;

    const completed = this.deliverables.filter(d =>
        d.status === 'completed' || d.status === 'delivered' || d.status === 'approved'
    ).length;

    return Math.round((completed / this.deliverables.length) * 100);
});

consultationSchema.virtual('actionItemsCompleted').get(function() {
    if (!this.content.actionItems || this.content.actionItems.length === 0) return 0;
    return this.content.actionItems.filter(a => a.status === 'completed').length;
});

consultationSchema.virtual('actionItemsTotal').get(function() {
    return this.content.actionItems?.length || 0;
});

// ==================== Pre-Save Middleware ====================
consultationSchema.pre('save', async function(next) {
    try {
        // Generate search tokens
        this.searchTokens = this._generateSearchTokens();

        // Update status history
        if (this.isModified('status.current') && this.status.current !== this._original?.status?.current) {
            this.status.history.push({
                status: this.status.current,
                changedAt: new Date(),
                changedBy: this.metadata?.updatedBy,
                reason: 'Status change'
            });
        }

        // Calculate actual duration if session ended
        if (this.schedule.actualStart && this.schedule.actualEnd) {
            this.schedule.duration.actual = Math.round(
                (this.schedule.actualEnd - this.schedule.actualStart) / (1000 * 60)
            );
        }

        // Calculate scheduled duration
        if (this.schedule.scheduledStart && this.schedule.scheduledEnd) {
            this.schedule.duration.scheduled = Math.round(
                (this.schedule.scheduledEnd - this.schedule.scheduledStart) / (1000 * 60)
            );
        }

        // Calculate objectives met percentage
        if (this.details.objectives && this.details.objectives.length > 0) {
            const achieved = this.details.objectives.filter(o => o.achieved).length;
            this.outcomes.objectivesMetPercentage = Math.round((achieved / this.details.objectives.length) * 100);
        }

        // Calculate billing
        if (this.billing.billable && this.billing.rate?.amount) {
            const hours = (this.schedule.duration?.actual || this.schedule.duration?.scheduled || 0) / 60;
            this.billing.actualCost = hours * this.billing.rate.amount;
        }

        next();
    } catch (error) {
        next(error);
    }
});

// ==================== Instance Methods ====================
consultationSchema.methods._generateSearchTokens = function() {
    const tokens = new Set();

    // Add title tokens
    if (this.details.title) {
        this.details.title.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    }

    // Add consultation ID
    if (this.consultationId) {
        tokens.add(this.consultationId.toLowerCase());
    }

    // Add type
    if (this.details.type) {
        tokens.add(this.details.type.toLowerCase());
    }

    // Add category
    if (this.details.category) {
        tokens.add(this.details.category.toLowerCase());
    }

    // Add tags
    this.metadata?.tags?.forEach(tag => tokens.add(tag.toLowerCase()));

    return Array.from(tokens);
};

consultationSchema.methods.start = async function(userId) {
    this.status.current = 'in_progress';
    this.schedule.actualStart = new Date();
    this.metadata.updatedBy = userId;
    return this.save();
};

consultationSchema.methods.complete = async function(userId, outcomeData = {}) {
    this.status.current = 'completed';
    this.schedule.actualEnd = new Date();

    if (outcomeData.summary) {
        this.content.summary = outcomeData.summary;
    }

    if (outcomeData.overallStatus) {
        this.outcomes.overallStatus = outcomeData.overallStatus;
    }

    if (outcomeData.keyAchievements) {
        this.outcomes.keyAchievements = outcomeData.keyAchievements;
    }

    this.metadata.updatedBy = userId;
    return this.save();
};

consultationSchema.methods.cancel = async function(userId, reason) {
    this.status.current = 'cancelled';
    this.status.cancellation = {
        reason,
        cancelledBy: userId,
        cancelledAt: new Date()
    };
    this.metadata.updatedBy = userId;
    return this.save();
};

consultationSchema.methods.reschedule = async function(newStart, newEnd, reason, userId) {
    // Add to reschedule history
    this.schedule.rescheduleHistory.push({
        originalStart: this.schedule.scheduledStart,
        originalEnd: this.schedule.scheduledEnd,
        newStart,
        newEnd,
        reason,
        requestedBy: userId,
        requestedAt: new Date()
    });

    // Update schedule
    this.schedule.scheduledStart = newStart;
    this.schedule.scheduledEnd = newEnd;
    this.schedule.rescheduled = true;
    this.status.current = 'rescheduled';

    this.metadata.updatedBy = userId;
    return this.save();
};

consultationSchema.methods.addActionItem = async function(actionItemData, userId) {
    const actionItem = {
        actionItemId: `AI-${Date.now()}`,
        ...actionItemData,
        status: actionItemData.status || 'pending'
    };

    if (!this.content.actionItems) {
        this.content.actionItems = [];
    }

    this.content.actionItems.push(actionItem);
    this.metadata.updatedBy = userId;
    return this.save();
};

consultationSchema.methods.updateActionItem = async function(actionItemId, updateData, userId) {
    const actionItem = this.content.actionItems?.find(a =>
        a.actionItemId === actionItemId || a._id?.toString() === actionItemId
    );

    if (!actionItem) {
        throw new Error('Action item not found');
    }

    Object.assign(actionItem, updateData);

    if (updateData.status === 'completed' && !actionItem.completedAt) {
        actionItem.completedAt = new Date();
    }

    this.metadata.updatedBy = userId;
    return this.save();
};

consultationSchema.methods.addDeliverable = async function(deliverableData, userId) {
    const deliverable = {
        deliverableId: `DEL-${Date.now()}`,
        ...deliverableData,
        status: deliverableData.status || 'not_started'
    };

    if (!this.deliverables) {
        this.deliverables = [];
    }

    this.deliverables.push(deliverable);
    this.metadata.updatedBy = userId;
    return this.save();
};

consultationSchema.methods.submitClientFeedback = async function(feedbackData, userId) {
    this.feedback.client = {
        ...feedbackData,
        submittedBy: userId,
        submittedAt: new Date()
    };

    // Update outcome metrics if provided
    if (feedbackData.rating) {
        if (!this.outcomes.metrics) {
            this.outcomes.metrics = {};
        }
        this.outcomes.metrics.clientSatisfaction = feedbackData.rating;
    }

    this.metadata.updatedBy = userId;
    return this.save();
};

consultationSchema.methods.submitConsultantFeedback = async function(feedbackData, userId) {
    this.feedback.consultant = {
        ...feedbackData,
        submittedAt: new Date()
    };

    this.metadata.updatedBy = userId;
    return this.save();
};

consultationSchema.methods.addNote = async function(noteData, userId) {
    const note = {
        content: noteData.content,
        type: noteData.type || 'general',
        visibility: noteData.visibility || 'internal',
        createdBy: userId,
        createdAt: new Date()
    };

    if (!this.documentation.notes) {
        this.documentation.notes = [];
    }

    this.documentation.notes.push(note);
    return this.save();
};

consultationSchema.methods.addRecording = async function(recordingData, userId) {
    const recording = {
        ...recordingData,
        uploadedAt: new Date()
    };

    if (!this.documentation.recordings) {
        this.documentation.recordings = [];
    }

    this.documentation.recordings.push(recording);
    this.metadata.updatedBy = userId;
    return this.save();
};

consultationSchema.methods.confirmAttendance = async function(userId, status = 'accepted') {
    const attendee = this.details.attendees?.find(a =>
        a.userId?.toString() === userId.toString()
    );

    if (attendee) {
        attendee.responseStatus = status;
        return this.save();
    }

    return this;
};

consultationSchema.methods.markAttended = async function(userId, attended = true) {
    const attendee = this.details.attendees?.find(a =>
        a.userId?.toString() === userId.toString()
    );

    if (attendee) {
        attendee.attended = attended;
        return this.save();
    }

    return this;
};

// ==================== Static Methods ====================
consultationSchema.statics.findByConsultant = function(tenantId, consultantId, options = {}) {
    const query = {
        tenantId,
        consultantId,
        'status.isDeleted': false
    };

    if (options.status) query['status.current'] = options.status;
    if (options.upcoming) {
        query['schedule.scheduledStart'] = { $gte: new Date() };
        query['status.current'] = { $in: ['scheduled', 'confirmed'] };
    }
    if (options.past) {
        query['schedule.scheduledEnd'] = { $lt: new Date() };
    }
    if (options.startDate || options.endDate) {
        query['schedule.scheduledStart'] = {};
        if (options.startDate) query['schedule.scheduledStart'].$gte = options.startDate;
        if (options.endDate) query['schedule.scheduledStart'].$lte = options.endDate;
    }

    return this.find(query)
        .populate('clientId', 'companyName clientCode')
        .populate('assignmentId', 'assignmentId details.role')
        .sort({ 'schedule.scheduledStart': -1 })
        .limit(options.limit || 50);
};

consultationSchema.statics.findByClient = function(tenantId, clientId, options = {}) {
    const query = {
        tenantId,
        clientId,
        'status.isDeleted': false
    };

    if (options.status) query['status.current'] = options.status;
    if (options.upcoming) {
        query['schedule.scheduledStart'] = { $gte: new Date() };
        query['status.current'] = { $in: ['scheduled', 'confirmed'] };
    }

    return this.find(query)
        .populate('consultantId', 'profile.firstName profile.lastName consultantCode professional.level')
        .populate('assignmentId', 'assignmentId details.role')
        .sort({ 'schedule.scheduledStart': -1 })
        .limit(options.limit || 50);
};

consultationSchema.statics.findByAssignment = function(tenantId, assignmentId, options = {}) {
    const query = {
        tenantId,
        assignmentId,
        'status.isDeleted': false
    };

    if (options.status) query['status.current'] = options.status;

    return this.find(query)
        .sort({ 'schedule.scheduledStart': -1 });
};

consultationSchema.statics.getUpcoming = function(tenantId, consultantId, days = 7) {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    return this.find({
        tenantId,
        consultantId,
        'status.current': { $in: ['scheduled', 'confirmed'] },
        'schedule.scheduledStart': { $gte: startDate, $lte: endDate },
        'status.isDeleted': false
    })
        .populate('clientId', 'companyName clientCode')
        .sort({ 'schedule.scheduledStart': 1 });
};

consultationSchema.statics.getConsultationMetrics = async function(tenantId, consultantId, startDate, endDate) {
    const match = {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        'status.isDeleted': false,
        'schedule.scheduledStart': { $gte: startDate, $lte: endDate }
    };

    if (consultantId) {
        match.consultantId = new mongoose.Types.ObjectId(consultantId);
    }

    const metrics = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalConsultations: { $sum: 1 },
                completedConsultations: {
                    $sum: { $cond: [{ $eq: ['$status.current', 'completed'] }, 1, 0] }
                },
                cancelledConsultations: {
                    $sum: { $cond: [{ $eq: ['$status.current', 'cancelled'] }, 1, 0] }
                },
                totalMinutes: { $sum: '$schedule.duration.actual' },
                averageRating: { $avg: '$feedback.client.rating' },
                uniqueClients: { $addToSet: '$clientId' },
                totalRevenue: { $sum: '$billing.actualCost' },
                averageSatisfaction: { $avg: '$outcomes.metrics.clientSatisfaction' },
                objectivesMetAverage: { $avg: '$outcomes.objectivesMetPercentage' }
            }
        },
        {
            $project: {
                _id: 0,
                totalConsultations: 1,
                completedConsultations: 1,
                cancelledConsultations: 1,
                completionRate: {
                    $cond: [
                        { $eq: ['$totalConsultations', 0] },
                        0,
                        { $multiply: [
                            { $divide: ['$completedConsultations', '$totalConsultations'] },
                            100
                        ]}
                    ]
                },
                totalHours: { $divide: ['$totalMinutes', 60] },
                averageRating: { $round: ['$averageRating', 2] },
                uniqueClients: { $size: '$uniqueClients' },
                totalRevenue: 1,
                averageSatisfaction: { $round: ['$averageSatisfaction', 2] },
                objectivesMetAverage: { $round: ['$objectivesMetAverage', 1] }
            }
        }
    ]);

    return metrics[0] || {
        totalConsultations: 0,
        completedConsultations: 0,
        cancelledConsultations: 0,
        completionRate: 0,
        totalHours: 0,
        averageRating: 0,
        uniqueClients: 0,
        totalRevenue: 0,
        averageSatisfaction: 0,
        objectivesMetAverage: 0
    };
};

consultationSchema.statics.getConsultationsByType = async function(tenantId, startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                tenantId: new mongoose.Types.ObjectId(tenantId),
                'status.isDeleted': false,
                'schedule.scheduledStart': { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: '$details.type',
                count: { $sum: 1 },
                totalMinutes: { $sum: '$schedule.duration.actual' },
                averageRating: { $avg: '$feedback.client.rating' }
            }
        },
        {
            $project: {
                type: '$_id',
                count: 1,
                totalHours: { $divide: ['$totalMinutes', 60] },
                averageRating: { $round: ['$averageRating', 2] }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

consultationSchema.statics.generateConsultationId = async function(tenantId, prefix = 'CONS') {
    const count = await this.countDocuments({ tenantId });
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}-${timestamp}-${(count + 1).toString().padStart(4, '0')}`;
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
    schema: consultationSchema,
    modelName: 'Consultation',
    createModel: function(connection) {
        if (connection) {
            return connection.model('Consultation', consultationSchema);
        }
        return mongoose.model('Consultation', consultationSchema);
    }
};

module.exports.Consultation = mongoose.model('Consultation', consultationSchema);
module.exports.consultationSchema = consultationSchema;
