'use strict';

/**
 * @fileoverview Consultant Skill Model - Skill taxonomy and assessment tracking
 * @module shared/lib/database/models/customer-services/core-business/consultant-management/consultant-skill-model
 * @description Standalone skill entity for skill taxonomy management and detailed skill assessments
 * @requires mongoose
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const logger = require('../../../../../utils/logger');

/**
 * Consultant Skill Schema Definition
 * Represents individual skill assessments and tracking for consultants
 */
const consultantSkillSchemaDefinition = {
    // ==================== Core Identity ====================
    skillRecordId: {
        type: String,
        unique: true,
        required: true,
        uppercase: true,
        match: /^SKR-[A-Z0-9-]+$/,
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

    skillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
        index: true
    },

    // ==================== Skill Information ====================
    skill: {
        name: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        normalizedName: {
            type: String,
            lowercase: true,
            trim: true,
            index: true
        },
        category: {
            type: String,
            enum: ['technical', 'functional', 'domain', 'soft_skill', 'tool', 'methodology', 'language', 'framework', 'platform', 'database', 'other'],
            required: true,
            index: true
        },
        subcategory: {
            type: String,
            trim: true
        },
        description: {
            type: String,
            maxlength: 1000
        },
        tags: [{
            type: String,
            trim: true
        }],
        aliases: [{
            type: String,
            trim: true
        }],
        parentSkill: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ConsultantSkill'
        },
        relatedSkills: [{
            skillId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'ConsultantSkill'
            },
            relationshipType: {
                type: String,
                enum: ['prerequisite', 'complementary', 'advanced_version', 'similar', 'alternative']
            }
        }]
    },

    // ==================== Proficiency Assessment ====================
    proficiency: {
        level: {
            type: String,
            enum: ['none', 'beginner', 'intermediate', 'advanced', 'expert', 'master'],
            default: 'beginner',
            index: true
        },
        score: {
            type: Number,
            min: 0,
            max: 100,
            default: 0
        },
        selfAssessment: {
            level: {
                type: String,
                enum: ['none', 'beginner', 'intermediate', 'advanced', 'expert', 'master']
            },
            score: Number,
            assessedAt: Date,
            notes: String
        },
        managerAssessment: {
            level: {
                type: String,
                enum: ['none', 'beginner', 'intermediate', 'advanced', 'expert', 'master']
            },
            score: Number,
            assessedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            assessedAt: Date,
            notes: String
        },
        peerAssessments: [{
            level: {
                type: String,
                enum: ['none', 'beginner', 'intermediate', 'advanced', 'expert', 'master']
            },
            score: Number,
            assessedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            assessedAt: Date,
            notes: String
        }],
        certificationBased: {
            certified: Boolean,
            certificationId: String,
            certificationName: String,
            score: Number,
            earnedAt: Date
        }
    },

    // ==================== Experience Tracking ====================
    experience: {
        yearsOfExperience: {
            type: Number,
            min: 0,
            max: 50,
            default: 0
        },
        monthsOfExperience: {
            type: Number,
            min: 0,
            max: 600,
            default: 0
        },
        firstUsed: Date,
        lastUsed: Date,
        currentlyUsing: {
            type: Boolean,
            default: false
        },
        totalProjects: {
            type: Number,
            min: 0,
            default: 0
        },
        totalHours: {
            type: Number,
            min: 0,
            default: 0
        },
        contexts: [{
            context: {
                type: String,
                enum: ['work', 'personal', 'education', 'certification', 'volunteer', 'open_source']
            },
            percentage: Number
        }]
    },

    // ==================== Project History ====================
    projectHistory: [{
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Project'
        },
        projectName: String,
        clientName: String,
        role: String,
        startDate: Date,
        endDate: Date,
        hoursLogged: Number,
        responsibilities: [String],
        achievements: [String],
        skillApplication: {
            type: String,
            enum: ['primary', 'secondary', 'supporting', 'learning']
        },
        complexity: {
            type: String,
            enum: ['basic', 'moderate', 'complex', 'expert_level']
        },
        feedback: {
            rating: Number,
            comment: String,
            givenBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        }
    }],

    // ==================== Training & Development ====================
    training: {
        coursesCompleted: [{
            courseId: String,
            courseName: String,
            provider: String,
            completedAt: Date,
            score: Number,
            duration: Number,
            certificate: {
                url: String,
                credentialId: String
            }
        }],
        currentlyEnrolled: [{
            courseId: String,
            courseName: String,
            provider: String,
            enrolledAt: Date,
            expectedCompletion: Date,
            progress: Number
        }],
        recommendedCourses: [{
            courseId: String,
            courseName: String,
            provider: String,
            recommendedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            recommendedAt: Date,
            reason: String,
            priority: {
                type: String,
                enum: ['low', 'medium', 'high', 'critical']
            }
        }],
        learningPath: [{
            milestone: String,
            targetLevel: String,
            targetDate: Date,
            status: {
                type: String,
                enum: ['not_started', 'in_progress', 'completed', 'deferred']
            },
            resources: [String]
        }]
    },

    // ==================== Verification & Endorsements ====================
    verification: {
        status: {
            type: String,
            enum: ['unverified', 'self_reported', 'peer_verified', 'manager_verified', 'certified', 'tested'],
            default: 'self_reported'
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        verifiedAt: Date,
        verificationMethod: {
            type: String,
            enum: ['self_declaration', 'peer_review', 'manager_review', 'certification', 'skill_test', 'project_demonstration']
        },
        verificationNotes: String,
        lastVerificationDate: Date,
        nextVerificationDue: Date
    },

    endorsements: [{
        endorserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        endorserName: String,
        endorserTitle: String,
        relationship: {
            type: String,
            enum: ['manager', 'peer', 'direct_report', 'client', 'external', 'self']
        },
        endorsedAt: Date,
        comment: String,
        rating: Number,
        visible: {
            type: Boolean,
            default: true
        }
    }],

    // ==================== Goals & Targets ====================
    goals: {
        targetLevel: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced', 'expert', 'master']
        },
        targetDate: Date,
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
        },
        developmentPlan: String,
        milestones: [{
            milestone: String,
            targetDate: Date,
            achieved: Boolean,
            achievedAt: Date
        }],
        blockers: [{
            description: String,
            identifiedAt: Date,
            resolved: Boolean,
            resolvedAt: Date,
            resolution: String
        }]
    },

    // ==================== Market & Demand ====================
    marketData: {
        demandLevel: {
            type: String,
            enum: ['low', 'moderate', 'high', 'critical'],
            default: 'moderate'
        },
        trendDirection: {
            type: String,
            enum: ['declining', 'stable', 'growing', 'emerging']
        },
        marketRate: {
            min: Number,
            max: Number,
            average: Number,
            currency: {
                type: String,
                default: 'USD'
            }
        },
        lastMarketUpdate: Date,
        competitiveness: {
            type: String,
            enum: ['low', 'moderate', 'high', 'very_high']
        }
    },

    // ==================== Status & Lifecycle ====================
    status: {
        current: {
            type: String,
            enum: ['active', 'inactive', 'archived', 'deprecated'],
            default: 'active',
            index: true
        },
        isPrimary: {
            type: Boolean,
            default: false
        },
        isFeatured: {
            type: Boolean,
            default: false
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

    // ==================== Metadata ====================
    metadata: {
        source: {
            type: String,
            enum: ['manual', 'import', 'linkedin', 'resume_parse', 'certification', 'project', 'api']
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
        notes: String
    }
};

const consultantSkillSchema = new Schema(consultantSkillSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ==================== Indexes ====================
consultantSkillSchema.index({ tenantId: 1, skillRecordId: 1 }, { unique: true });
consultantSkillSchema.index({ tenantId: 1, consultantId: 1 });
consultantSkillSchema.index({ tenantId: 1, 'skill.name': 1 });
consultantSkillSchema.index({ tenantId: 1, 'skill.category': 1 });
consultantSkillSchema.index({ tenantId: 1, 'proficiency.level': 1 });
consultantSkillSchema.index({ tenantId: 1, consultantId: 1, 'skill.name': 1 }, { unique: true });
consultantSkillSchema.index({ 'skill.normalizedName': 1 });
consultantSkillSchema.index({ 'skill.name': 'text', 'skill.description': 'text', 'skill.tags': 'text' });

// ==================== Pre-Save Middleware ====================
consultantSkillSchema.pre('save', function(next) {
    if (this.skill?.name) {
        this.skill.normalizedName = this.skill.name.toLowerCase().trim();
    }
    next();
});

// ==================== Instance Methods ====================
consultantSkillSchema.methods.addEndorsement = async function(endorsementData) {
    const existingEndorsement = this.endorsements.find(e => 
        e.endorserId?.toString() === endorsementData.endorserId?.toString()
    );

    if (existingEndorsement) {
        Object.assign(existingEndorsement, endorsementData, { endorsedAt: new Date() });
    } else {
        this.endorsements.push({ ...endorsementData, endorsedAt: new Date() });
    }

    return this.save();
};

consultantSkillSchema.methods.addProjectExperience = async function(projectData) {
    this.projectHistory.push(projectData);
    this.experience.totalProjects = this.projectHistory.length;
    
    if (projectData.hoursLogged) {
        this.experience.totalHours = (this.experience.totalHours || 0) + projectData.hoursLogged;
    }

    if (!this.experience.firstUsed || projectData.startDate < this.experience.firstUsed) {
        this.experience.firstUsed = projectData.startDate;
    }

    if (!this.experience.lastUsed || projectData.endDate > this.experience.lastUsed) {
        this.experience.lastUsed = projectData.endDate || new Date();
    }

    return this.save();
};

consultantSkillSchema.methods.updateProficiency = async function(assessmentData) {
    const { type, level, score, assessedBy, notes } = assessmentData;

    if (type === 'self') {
        this.proficiency.selfAssessment = {
            level,
            score,
            assessedAt: new Date(),
            notes
        };
    } else if (type === 'manager') {
        this.proficiency.managerAssessment = {
            level,
            score,
            assessedBy,
            assessedAt: new Date(),
            notes
        };
    } else if (type === 'peer') {
        this.proficiency.peerAssessments.push({
            level,
            score,
            assessedBy,
            assessedAt: new Date(),
            notes
        });
    }

    // Calculate overall proficiency based on assessments
    this._calculateOverallProficiency();

    return this.save();
};

consultantSkillSchema.methods._calculateOverallProficiency = function() {
    const levelValues = {
        'none': 0,
        'beginner': 20,
        'intermediate': 40,
        'advanced': 60,
        'expert': 80,
        'master': 100
    };

    const scores = [];

    if (this.proficiency.selfAssessment?.level) {
        scores.push({ value: levelValues[this.proficiency.selfAssessment.level], weight: 0.2 });
    }

    if (this.proficiency.managerAssessment?.level) {
        scores.push({ value: levelValues[this.proficiency.managerAssessment.level], weight: 0.4 });
    }

    if (this.proficiency.peerAssessments?.length > 0) {
        const avgPeerScore = this.proficiency.peerAssessments.reduce((sum, p) => 
            sum + levelValues[p.level], 0) / this.proficiency.peerAssessments.length;
        scores.push({ value: avgPeerScore, weight: 0.3 });
    }

    if (this.proficiency.certificationBased?.certified) {
        scores.push({ value: this.proficiency.certificationBased.score || 80, weight: 0.3 });
    }

    if (scores.length > 0) {
        const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
        const weightedScore = scores.reduce((sum, s) => sum + (s.value * s.weight), 0) / totalWeight;

        this.proficiency.score = Math.round(weightedScore);

        if (weightedScore <= 10) this.proficiency.level = 'none';
        else if (weightedScore <= 30) this.proficiency.level = 'beginner';
        else if (weightedScore <= 50) this.proficiency.level = 'intermediate';
        else if (weightedScore <= 70) this.proficiency.level = 'advanced';
        else if (weightedScore <= 90) this.proficiency.level = 'expert';
        else this.proficiency.level = 'master';
    }
};

// ==================== Static Methods ====================
consultantSkillSchema.statics.findByConsultant = function(tenantId, consultantId, filters = {}) {
    const query = {
        tenantId,
        consultantId,
        'status.isDeleted': false
    };

    if (filters.category) query['skill.category'] = filters.category;
    if (filters.level) query['proficiency.level'] = filters.level;
    if (filters.verified) query['verification.status'] = { $in: ['peer_verified', 'manager_verified', 'certified', 'tested'] };

    return this.find(query).sort({ 'proficiency.score': -1 });
};

consultantSkillSchema.statics.getSkillDistribution = function(tenantId, consultantId = null) {
    const matchStage = {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        'status.isDeleted': false
    };

    if (consultantId) {
        matchStage.consultantId = new mongoose.Types.ObjectId(consultantId);
    }

    return this.aggregate([
        { $match: matchStage },
        { $facet: {
            byCategory: [
                { $group: { _id: '$skill.category', count: { $sum: 1 }, avgScore: { $avg: '$proficiency.score' } }}
            ],
            byLevel: [
                { $group: { _id: '$proficiency.level', count: { $sum: 1 } }}
            ],
            topSkills: [
                { $group: { 
                    _id: '$skill.normalizedName', 
                    count: { $sum: 1 },
                    avgScore: { $avg: '$proficiency.score' },
                    name: { $first: '$skill.name' }
                }},
                { $sort: { count: -1 } },
                { $limit: 20 }
            ]
        }}
    ]);
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
    schema: consultantSkillSchema,
    modelName: 'ConsultantSkill',
    createModel: function(connection) {
        if (connection) {
            return connection.model('ConsultantSkill', consultantSkillSchema);
        }
        return mongoose.model('ConsultantSkill', consultantSkillSchema);
    }
};

module.exports.ConsultantSkill = mongoose.model('ConsultantSkill', consultantSkillSchema);
module.exports.consultantSkillSchema = consultantSkillSchema;