'use strict';

/**
 * @fileoverview Consultant Model - Professional service provider entity
 * @module shared/lib/database/models/customer-services/core-business/consultant-management/consultant-model
 * @description Multi-tenant Consultant model for managing consulting professionals, their skills, 
 * certifications, availability, and assignments
 * @requires mongoose
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const logger = require('../../../../../utils/logger');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const EncryptionService = require('../../../../../security/encryption/encryption-service');

/**
 * Consultant Schema Definition
 * Represents professional consultants who deliver services to clients
 */
const consultantSchemaDefinition = {
    // ==================== Core Identity ====================
    consultantCode: {
        type: String,
        unique: true,
        required: true,
        uppercase: true,
        match: /^CON-[A-Z0-9-]+$/,
        index: true,
        immutable: true
    },

    // ==================== Multi-Tenancy & Organization ====================
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

    // Link to User account
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },

    // ==================== Personal Information ====================
    profile: {
        firstName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        lastName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        middleName: {
            type: String,
            trim: true,
            maxlength: 100
        },
        preferredName: {
            type: String,
            trim: true,
            maxlength: 100
        },
        title: {
            type: String,
            trim: true,
            maxlength: 100
        },
        bio: {
            type: String,
            maxlength: 5000
        },
        summary: {
            type: String,
            maxlength: 1000
        },
        avatar: {
            type: String
        },
        dateOfBirth: {
            type: Date
        },
        gender: {
            type: String,
            enum: ['male', 'female', 'non_binary', 'prefer_not_to_say', 'other']
        },
        nationality: {
            type: String
        },
        languages: [{
            language: {
                type: String,
                required: true
            },
            proficiency: {
                type: String,
                enum: ['native', 'fluent', 'advanced', 'intermediate', 'basic']
            },
            certified: Boolean
        }]
    },

    // ==================== Contact Information ====================
    contact: {
        email: {
            primary: {
                type: String,
                required: true,
                lowercase: true,
                trim: true,
                index: true
            },
            work: {
                type: String,
                lowercase: true,
                trim: true
            },
            personal: {
                type: String,
                lowercase: true,
                trim: true
            }
        },
        phone: {
            primary: {
                type: String,
                trim: true
            },
            mobile: {
                type: String,
                trim: true
            },
            work: {
                type: String,
                trim: true
            }
        },
        address: {
            street: String,
            street2: String,
            city: String,
            state: String,
            postalCode: String,
            country: String,
            coordinates: {
                latitude: Number,
                longitude: Number
            }
        },
        linkedIn: {
            type: String,
            trim: true
        },
        portfolio: {
            type: String,
            trim: true
        },
        website: {
            type: String,
            trim: true
        }
    },

    // ==================== Professional Information ====================
    professional: {
        employmentType: {
            type: String,
            enum: ['full_time', 'part_time', 'contract', 'freelance', 'associate', 'partner'],
            default: 'full_time',
            index: true
        },
        level: {
            type: String,
            enum: ['junior', 'mid', 'senior', 'lead', 'principal', 'director', 'partner'],
            default: 'mid',
            index: true
        },
        grade: {
            type: String,
            trim: true
        },
        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Department',
            index: true
        },
        team: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Team',
            index: true
        },
        manager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Consultant',
            index: true
        },
        directReports: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Consultant'
        }],
        startDate: {
            type: Date,
            required: true
        },
        endDate: Date,
        yearsOfExperience: {
            type: Number,
            min: 0,
            max: 50
        },
        industryExperience: [{
            industry: String,
            years: Number,
            description: String
        }]
    },

    // ==================== Skills & Expertise ====================
    skills: [{
        skillId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Skill'
        },
        name: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        category: {
            type: String,
            enum: ['technical', 'functional', 'domain', 'soft_skill', 'tool', 'methodology', 'language', 'other'],
            index: true
        },
        proficiencyLevel: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced', 'expert', 'master'],
            default: 'intermediate'
        },
        yearsOfExperience: {
            type: Number,
            min: 0
        },
        lastUsed: Date,
        verified: {
            type: Boolean,
            default: false
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        verifiedAt: Date,
        endorsements: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            endorsedAt: Date,
            comment: String
        }],
        projects: [{
            projectId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Project'
            },
            projectName: String,
            role: String
        }]
    }],

    // ==================== Certifications ====================
    certifications: [{
        certificationId: String,
        name: {
            type: String,
            required: true
        },
        issuingOrganization: {
            type: String,
            required: true
        },
        issueDate: {
            type: Date,
            required: true
        },
        expirationDate: Date,
        credentialId: String,
        credentialUrl: String,
        status: {
            type: String,
            enum: ['active', 'expired', 'pending_renewal', 'revoked'],
            default: 'active'
        },
        verificationStatus: {
            type: String,
            enum: ['verified', 'pending', 'failed', 'not_verified'],
            default: 'not_verified'
        },
        verifiedAt: Date,
        document: {
            url: String,
            uploadedAt: Date
        },
        category: {
            type: String,
            enum: ['technical', 'professional', 'industry', 'compliance', 'methodology', 'tool', 'other']
        }
    }],

    // ==================== Education ====================
    education: [{
        institution: {
            type: String,
            required: true
        },
        degree: {
            type: String,
            required: true
        },
        fieldOfStudy: String,
        startDate: Date,
        endDate: Date,
        current: Boolean,
        grade: String,
        honors: String,
        activities: [String],
        description: String
    }],

    // ==================== Work History ====================
    workHistory: [{
        company: {
            type: String,
            required: true
        },
        title: {
            type: String,
            required: true
        },
        location: String,
        startDate: {
            type: Date,
            required: true
        },
        endDate: Date,
        current: Boolean,
        description: String,
        responsibilities: [String],
        achievements: [String],
        technologies: [String],
        reference: {
            name: String,
            title: String,
            email: String,
            phone: String,
            canContact: Boolean
        }
    }],

    // ==================== Availability & Capacity ====================
    availability: {
        status: {
            type: String,
            enum: ['available', 'partially_available', 'unavailable', 'on_leave', 'on_project'],
            default: 'available',
            index: true
        },
        capacityPercentage: {
            type: Number,
            min: 0,
            max: 100,
            default: 100
        },
        hoursPerWeek: {
            type: Number,
            min: 0,
            max: 80,
            default: 40
        },
        availableFrom: Date,
        availableUntil: Date,
        preferredWorkHours: {
            start: String,
            end: String,
            timezone: String
        },
        remotePreference: {
            type: String,
            enum: ['remote_only', 'hybrid', 'on_site', 'flexible'],
            default: 'flexible'
        },
        travelWillingness: {
            type: String,
            enum: ['none', 'local', 'regional', 'national', 'international'],
            default: 'regional'
        },
        travelPercentage: {
            type: Number,
            min: 0,
            max: 100,
            default: 25
        },
        relocationWillingness: {
            type: Boolean,
            default: false
        },
        preferredLocations: [String],
        excludedLocations: [String],
        blackoutDates: [{
            startDate: Date,
            endDate: Date,
            reason: String,
            recurring: Boolean
        }],
        lastUpdated: Date
    },

    // ==================== Current Assignments ====================
    assignments: [{
        assignmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Assignment'
        },
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Project'
        },
        clientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Client'
        },
        projectName: String,
        clientName: String,
        role: String,
        startDate: {
            type: Date,
            required: true
        },
        endDate: Date,
        allocationPercentage: {
            type: Number,
            min: 0,
            max: 100
        },
        billableRate: {
            amount: Number,
            currency: {
                type: String,
                default: 'USD'
            }
        },
        status: {
            type: String,
            enum: ['proposed', 'confirmed', 'active', 'on_hold', 'completed', 'cancelled'],
            default: 'proposed'
        },
        notes: String
    }],

    // ==================== Rates & Billing ====================
    billing: {
        defaultRate: {
            amount: {
                type: Number,
                min: 0
            },
            currency: {
                type: String,
                default: 'USD'
            },
            type: {
                type: String,
                enum: ['hourly', 'daily', 'weekly', 'monthly', 'fixed'],
                default: 'hourly'
            }
        },
        rateHistory: [{
            rate: Number,
            currency: String,
            effectiveFrom: Date,
            effectiveTo: Date,
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            reason: String
        }],
        costRate: {
            amount: Number,
            currency: String
        },
        utilization: {
            target: {
                type: Number,
                min: 0,
                max: 100,
                default: 80
            },
            current: {
                type: Number,
                min: 0,
                max: 100
            },
            ytd: {
                type: Number,
                min: 0,
                max: 100
            }
        },
        billableHoursTarget: {
            weekly: Number,
            monthly: Number,
            annually: Number
        }
    },

    // ==================== Performance & Reviews ====================
    performance: {
        rating: {
            overall: {
                type: Number,
                min: 1,
                max: 5
            },
            technical: {
                type: Number,
                min: 1,
                max: 5
            },
            communication: {
                type: Number,
                min: 1,
                max: 5
            },
            leadership: {
                type: Number,
                min: 1,
                max: 5
            },
            delivery: {
                type: Number,
                min: 1,
                max: 5
            },
            lastReviewDate: Date,
            nextReviewDate: Date
        },
        reviews: [{
            reviewId: String,
            type: {
                type: String,
                enum: ['annual', 'mid_year', 'quarterly', 'project', '360', 'probation']
            },
            reviewDate: Date,
            reviewer: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            overallRating: Number,
            ratings: {
                type: Map,
                of: Number
            },
            strengths: [String],
            areasForImprovement: [String],
            goals: [{
                goal: String,
                deadline: Date,
                status: String,
                progress: Number
            }],
            comments: String,
            status: {
                type: String,
                enum: ['draft', 'submitted', 'acknowledged', 'appealed', 'finalized']
            }
        }],
        feedback: [{
            feedbackId: String,
            type: {
                type: String,
                enum: ['client', 'peer', 'manager', 'direct_report', 'self']
            },
            source: {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User'
                },
                clientId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Client'
                },
                projectId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Project'
                }
            },
            rating: Number,
            categories: {
                type: Map,
                of: Number
            },
            content: String,
            isAnonymous: Boolean,
            createdAt: Date
        }],
        achievements: [{
            title: String,
            description: String,
            date: Date,
            category: String,
            awarded: Boolean,
            awardedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        }]
    },

    // ==================== Documents ====================
    documents: [{
        documentId: String,
        type: {
            type: String,
            enum: ['resume', 'contract', 'nda', 'certification', 'id', 'background_check', 'reference', 'other'],
            required: true
        },
        name: String,
        description: String,
        url: String,
        mimeType: String,
        size: Number,
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        uploadedAt: Date,
        expirationDate: Date,
        status: {
            type: String,
            enum: ['active', 'archived', 'expired', 'pending_review'],
            default: 'active'
        },
        visibility: {
            type: String,
            enum: ['public', 'internal', 'confidential', 'private'],
            default: 'internal'
        }
    }],

    // ==================== Preferences & Settings ====================
    preferences: {
        projectTypes: [{
            type: String,
            enum: ['implementation', 'strategy', 'advisory', 'training', 'support', 'audit', 'transformation', 'integration']
        }],
        clientTypes: [{
            type: String,
            enum: ['enterprise', 'mid_market', 'startup', 'government', 'non_profit', 'education']
        }],
        industries: [String],
        excludedClients: [{
            clientId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Client'
            },
            reason: String
        }],
        notifications: {
            email: {
                assignments: Boolean,
                reviews: Boolean,
                training: Boolean,
                announcements: Boolean
            },
            push: {
                assignments: Boolean,
                reviews: Boolean,
                training: Boolean,
                announcements: Boolean
            }
        },
        privacy: {
            showEmail: Boolean,
            showPhone: Boolean,
            showAvailability: Boolean,
            showRates: Boolean
        }
    },

    // ==================== Compliance & Security ====================
    compliance: {
        backgroundCheck: {
            status: {
                type: String,
                enum: ['pending', 'passed', 'failed', 'expired', 'not_required'],
                default: 'pending'
            },
            completedAt: Date,
            expiresAt: Date,
            provider: String,
            referenceNumber: String
        },
        nda: {
            signed: Boolean,
            signedAt: Date,
            expiresAt: Date,
            documentUrl: String
        },
        conflictOfInterest: {
            declared: Boolean,
            declarations: [{
                description: String,
                relatedEntity: String,
                declaredAt: Date,
                resolution: String
            }]
        },
        securityClearance: {
            level: String,
            grantedAt: Date,
            expiresAt: Date,
            grantingAuthority: String
        }
    },

    // ==================== Status & Lifecycle ====================
    status: {
        current: {
            type: String,
            enum: ['active', 'inactive', 'on_leave', 'terminated', 'suspended', 'pending_activation'],
            default: 'pending_activation',
            index: true
        },
        reason: String,
        effectiveDate: Date,
        returnDate: Date,
        terminationDate: Date,
        terminationReason: String,
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

    // ==================== Custom Fields & Metadata ====================
    customFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },

    metadata: {
        source: {
            type: String,
            enum: ['direct_hire', 'referral', 'agency', 'internal_transfer', 'acquisition', 'contractor_conversion', 'import', 'api']
        },
        referredBy: {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            consultantId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Consultant'
            },
            name: String,
            relationship: String
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
        importBatch: String,
        importedFrom: String,
        externalIds: {
            hrms: String,
            payroll: String,
            crm: String
        }
    },

    // ==================== Search Tokens ====================
    searchTokens: {
        type: [String],
        select: false
    },

    // ==================== Tags ====================
    tags: [{
        type: String,
        index: true
    }]
};

const consultantSchema = new Schema(consultantSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ==================== Indexes ====================
consultantSchema.index({ tenantId: 1, consultantCode: 1 }, { unique: true });
consultantSchema.index({ tenantId: 1, 'contact.email.primary': 1 });
consultantSchema.index({ tenantId: 1, 'status.current': 1 });
consultantSchema.index({ tenantId: 1, 'professional.employmentType': 1 });
consultantSchema.index({ tenantId: 1, 'professional.level': 1 });
consultantSchema.index({ tenantId: 1, 'professional.department': 1 });
consultantSchema.index({ tenantId: 1, 'availability.status': 1 });
consultantSchema.index({ tenantId: 1, 'skills.name': 1 });
consultantSchema.index({ tenantId: 1, 'skills.category': 1 });
consultantSchema.index({ tenantId: 1, tags: 1 });
consultantSchema.index({ searchTokens: 1 });
consultantSchema.index({ 'profile.firstName': 'text', 'profile.lastName': 'text', 'skills.name': 'text', 'bio': 'text' });

// ==================== Virtuals ====================
consultantSchema.virtual('fullName').get(function() {
    return `${this.profile.firstName} ${this.profile.lastName}`;
});

consultantSchema.virtual('displayName').get(function() {
    return this.profile.preferredName || this.fullName;
});

consultantSchema.virtual('activeAssignments').get(function() {
    return this.assignments?.filter(a => a.status === 'active') || [];
});

consultantSchema.virtual('totalAllocation').get(function() {
    return this.activeAssignments.reduce((sum, a) => sum + (a.allocationPercentage || 0), 0);
});

consultantSchema.virtual('availableCapacity').get(function() {
    return Math.max(0, 100 - this.totalAllocation);
});

consultantSchema.virtual('skillCount').get(function() {
    return this.skills?.length || 0;
});

consultantSchema.virtual('certificationCount').get(function() {
    return this.certifications?.filter(c => c.status === 'active').length || 0;
});

// ==================== Pre-Save Middleware ====================
consultantSchema.pre('save', async function(next) {
    try {
        // Generate search tokens
        this.searchTokens = this._generateSearchTokens();

        // Update availability last updated
        if (this.isModified('availability')) {
            this.availability.lastUpdated = new Date();
        }

        next();
    } catch (error) {
        next(error);
    }
});

// ==================== Instance Methods ====================
consultantSchema.methods._generateSearchTokens = function() {
    const tokens = new Set();

    // Add name tokens
    if (this.profile.firstName) tokens.add(this.profile.firstName.toLowerCase());
    if (this.profile.lastName) tokens.add(this.profile.lastName.toLowerCase());
    if (this.profile.preferredName) tokens.add(this.profile.preferredName.toLowerCase());

    // Add skill tokens
    this.skills?.forEach(skill => {
        if (skill.name) tokens.add(skill.name.toLowerCase());
    });

    // Add tags
    this.tags?.forEach(tag => tokens.add(tag.toLowerCase()));

    // Add consultant code
    if (this.consultantCode) tokens.add(this.consultantCode.toLowerCase());

    return Array.from(tokens);
};

consultantSchema.methods.updateAvailability = async function(availabilityData) {
    Object.assign(this.availability, availabilityData);
    this.availability.lastUpdated = new Date();
    return this.save();
};

consultantSchema.methods.addSkill = async function(skillData) {
    const existingSkill = this.skills.find(s => 
        s.name.toLowerCase() === skillData.name.toLowerCase()
    );

    if (existingSkill) {
        Object.assign(existingSkill, skillData);
    } else {
        this.skills.push(skillData);
    }

    return this.save();
};

consultantSchema.methods.addCertification = async function(certificationData) {
    certificationData.certificationId = `CERT-${Date.now()}`;
    this.certifications.push(certificationData);
    return this.save();
};

consultantSchema.methods.addAssignment = async function(assignmentData) {
    this.assignments.push(assignmentData);
    
    // Recalculate availability
    const totalAllocation = this.assignments
        .filter(a => a.status === 'active' || a.status === 'confirmed')
        .reduce((sum, a) => sum + (a.allocationPercentage || 0), 0);
    
    if (totalAllocation >= 100) {
        this.availability.status = 'on_project';
        this.availability.capacityPercentage = 0;
    } else if (totalAllocation > 0) {
        this.availability.status = 'partially_available';
        this.availability.capacityPercentage = 100 - totalAllocation;
    }

    return this.save();
};

consultantSchema.methods.removeAssignment = async function(assignmentId) {
    this.assignments = this.assignments.filter(a => 
        a.assignmentId?.toString() !== assignmentId.toString()
    );

    // Recalculate availability
    const totalAllocation = this.assignments
        .filter(a => a.status === 'active' || a.status === 'confirmed')
        .reduce((sum, a) => sum + (a.allocationPercentage || 0), 0);
    
    if (totalAllocation === 0) {
        this.availability.status = 'available';
        this.availability.capacityPercentage = 100;
    } else if (totalAllocation < 100) {
        this.availability.status = 'partially_available';
        this.availability.capacityPercentage = 100 - totalAllocation;
    }

    return this.save();
};

// ==================== Static Methods ====================
consultantSchema.statics.findByCode = function(tenantId, consultantCode) {
    return this.findOne({ 
        tenantId, 
        consultantCode: consultantCode.toUpperCase() 
    });
};

consultantSchema.statics.findAvailable = function(tenantId, filters = {}) {
    const query = {
        tenantId,
        'status.current': 'active',
        'status.isDeleted': false,
        'availability.status': { $in: ['available', 'partially_available'] }
    };

    if (filters.minCapacity) {
        query['availability.capacityPercentage'] = { $gte: filters.minCapacity };
    }

    if (filters.skills && filters.skills.length > 0) {
        query['skills.name'] = { $in: filters.skills };
    }

    if (filters.level) {
        query['professional.level'] = filters.level;
    }

    return this.find(query);
};

consultantSchema.statics.searchBySkills = function(tenantId, skills, options = {}) {
    const pipeline = [
        { $match: { 
            tenantId: new mongoose.Types.ObjectId(tenantId),
            'status.current': 'active',
            'status.isDeleted': false
        }},
        { $addFields: {
            matchedSkills: {
                $filter: {
                    input: '$skills',
                    as: 'skill',
                    cond: { $in: ['$$skill.name', skills] }
                }
            }
        }},
        { $match: { 'matchedSkills.0': { $exists: true } }},
        { $addFields: {
            matchCount: { $size: '$matchedSkills' },
            matchPercentage: { 
                $multiply: [
                    { $divide: [{ $size: '$matchedSkills' }, skills.length] },
                    100
                ]
            }
        }},
        { $sort: { matchCount: -1, 'performance.rating.overall': -1 } }
    ];

    if (options.limit) {
        pipeline.push({ $limit: options.limit });
    }

    return this.aggregate(pipeline);
};

consultantSchema.statics.getStatistics = async function(tenantId) {
    return this.aggregate([
        { $match: { 
            tenantId: new mongoose.Types.ObjectId(tenantId),
            'status.isDeleted': false
        }},
        { $facet: {
            byStatus: [
                { $group: { _id: '$status.current', count: { $sum: 1 } }}
            ],
            byLevel: [
                { $group: { _id: '$professional.level', count: { $sum: 1 } }}
            ],
            byAvailability: [
                { $group: { _id: '$availability.status', count: { $sum: 1 } }}
            ],
            byEmploymentType: [
                { $group: { _id: '$professional.employmentType', count: { $sum: 1 } }}
            ],
            topSkills: [
                { $unwind: '$skills' },
                { $group: { _id: '$skills.name', count: { $sum: 1 } }},
                { $sort: { count: -1 } },
                { $limit: 20 }
            ],
            averageRating: [
                { $group: { _id: null, avg: { $avg: '$performance.rating.overall' } }}
            ],
            totals: [
                { $group: { _id: null, total: { $sum: 1 } }}
            ]
        }}
    ]);
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
    schema: consultantSchema,
    modelName: 'Consultant',
    createModel: function(connection) {
        if (connection) {
            return connection.model('Consultant', consultantSchema);
        }
        return mongoose.model('Consultant', consultantSchema);
    }
};

module.exports.Consultant = mongoose.model('Consultant', consultantSchema);
module.exports.consultantSchema = consultantSchema;