'use strict';

/**
 * @fileoverview Enhanced consultant skill model with comprehensive skills management and assessment
 * @module servers/customer-services/modules/core-business/consultants/models/consultant-skill-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../../shared/lib/utils/helpers/string-helper');

/**
 * Enhanced consultant skill schema for comprehensive skills tracking and assessment
 */
const consultantSkillSchemaDefinition = {
  // ==================== Core Identity ====================
  skillId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^SKL-[A-Z0-9]{8}$/,
    index: true,
    immutable: true
  },

  consultantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultant',
    required: true,
    index: true
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

  // ==================== Skill Definition ====================
  skill: {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    category: {
      primary: {
        type: String,
        required: true,
        enum: ['technical', 'functional', 'industry', 'soft', 'leadership', 'management', 'language']
      },
      secondary: String,
      tags: [String]
    },
    type: {
      type: String,
      enum: ['core', 'specialized', 'emerging', 'legacy', 'complementary'],
      required: true
    },
    description: {
      type: String,
      maxlength: 1000
    },
    aliases: [String],
    parentSkill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConsultantSkill'
    },
    relatedSkills: [{
      skillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ConsultantSkill'
      },
      relationship: {
        type: String,
        enum: ['prerequisite', 'complementary', 'alternative', 'advanced', 'subset']
      },
      strength: {
        type: Number,
        min: 0,
        max: 1
      }
    }],
    industryRelevance: [{
      industry: String,
      relevance: {
        type: String,
        enum: ['critical', 'important', 'useful', 'optional']
      },
      demand: {
        type: String,
        enum: ['very_high', 'high', 'moderate', 'low', 'declining']
      }
    }],
    complexity: {
      type: String,
      enum: ['basic', 'intermediate', 'advanced', 'expert', 'specialist'],
      required: true
    }
  },

  // ==================== Proficiency & Assessment ====================
  proficiency: {
    currentLevel: {
      type: Number,
      min: 0,
      max: 10,
      required: true,
      default: 0
    },
    targetLevel: {
      type: Number,
      min: 0,
      max: 10
    },
    selfAssessment: {
      level: {
        type: Number,
        min: 0,
        max: 10
      },
      confidence: {
        type: Number,
        min: 0,
        max: 100
      },
      date: Date,
      justification: String
    },
    managerAssessment: {
      level: {
        type: Number,
        min: 0,
        max: 10
      },
      assessedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      date: Date,
      comments: String
    },
    peerAssessments: [{
      level: {
        type: Number,
        min: 0,
        max: 10
      },
      assessedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consultant'
      },
      date: Date,
      relationship: String,
      comments: String
    }],
    clientAssessments: [{
      level: {
        type: Number,
        min: 0,
        max: 10
      },
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      },
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      date: Date,
      context: String,
      feedback: String
    }],
    formalAssessment: {
      level: {
        type: Number,
        min: 0,
        max: 10
      },
      method: {
        type: String,
        enum: ['exam', 'practical', 'project', 'interview', 'simulation', 'portfolio']
      },
      provider: String,
      date: Date,
      score: Number,
      percentile: Number,
      certificateNumber: String,
      expiryDate: Date,
      report: String
    },
    calculatedLevel: {
      value: {
        type: Number,
        min: 0,
        max: 10
      },
      method: {
        type: String,
        enum: ['average', 'weighted', 'highest', 'latest', 'consensus']
      },
      confidence: {
        type: Number,
        min: 0,
        max: 100
      },
      lastCalculated: Date
    }
  },

  // ==================== Experience & Evidence ====================
  experience: {
    totalYears: {
      type: Number,
      min: 0,
      default: 0
    },
    recentYears: {
      type: Number,
      min: 0,
      default: 0
    },
    firstUsed: Date,
    lastUsed: Date,
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'rarely'],
      default: 'rarely'
    },
    depth: {
      type: String,
      enum: ['surface', 'working', 'proficient', 'deep', 'expert']
    },
    projects: [{
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      projectName: String,
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      },
      role: String,
      period: {
        start: Date,
        end: Date
      },
      usage: {
        type: String,
        enum: ['primary', 'secondary', 'supporting', 'minimal']
      },
      complexity: {
        type: String,
        enum: ['simple', 'moderate', 'complex', 'highly_complex']
      },
      achievements: [String],
      challenges: [String],
      learnings: [String]
    }],
    contexts: [{
      context: {
        type: String,
        enum: ['development', 'implementation', 'analysis', 'design', 'management', 'training', 'support']
      },
      frequency: {
        type: String,
        enum: ['rare', 'occasional', 'regular', 'frequent', 'constant']
      },
      examples: [String]
    }],
    industries: [{
      industry: String,
      projects: Number,
      years: Number,
      lastUsed: Date
    }],
    evidence: [{
      type: {
        type: String,
        enum: ['project', 'certification', 'training', 'publication', 'presentation', 'code', 'artifact']
      },
      title: String,
      description: String,
      date: Date,
      url: String,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      verifiedAt: Date,
      impact: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      }
    }]
  },

  // ==================== Certifications & Credentials ====================
  certifications: [{
    name: {
      type: String,
      required: true
    },
    issuingBody: {
      type: String,
      required: true
    },
    certificationNumber: String,
    level: String,
    issueDate: {
      type: Date,
      required: true
    },
    expiryDate: Date,
    status: {
      type: String,
      enum: ['active', 'expired', 'suspended', 'revoked', 'pending'],
      default: 'active'
    },
    verificationUrl: String,
    documentUrl: String,
    maintenanceRequired: Boolean,
    cpdHours: Number,
    renewalCost: Number,
    relevance: {
      type: String,
      enum: ['directly_related', 'related', 'somewhat_related', 'complementary']
    }
  }],

  training: [{
    courseName: {
      type: String,
      required: true
    },
    provider: {
      type: String,
      required: true
    },
    format: {
      type: String,
      enum: ['online', 'classroom', 'blended', 'self_study', 'workshop', 'bootcamp']
    },
    completionDate: Date,
    duration: {
      hours: Number,
      days: Number
    },
    score: Number,
    certificateUrl: String,
    skills: [String],
    practicalComponent: Boolean,
    projectWork: String,
    effectiveness: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      applicability: {
        type: String,
        enum: ['immediately_applicable', 'somewhat_applicable', 'future_use', 'not_applicable']
      },
      knowledgeGain: {
        type: String,
        enum: ['significant', 'moderate', 'minimal', 'none']
      }
    }
  }],

  // ==================== Development & Improvement ====================
  development: {
    status: {
      type: String,
      enum: ['not_started', 'learning', 'practicing', 'improving', 'maintaining', 'expert'],
      default: 'not_started'
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'nice_to_have'],
      default: 'medium'
    },
    plan: {
      objectives: [{
        objective: String,
        targetDate: Date,
        measureOfSuccess: String,
        completed: Boolean,
        completedDate: Date
      }],
      activities: [{
        activity: String,
        type: {
          type: String,
          enum: ['training', 'certification', 'project', 'mentoring', 'self_study', 'practice']
        },
        status: {
          type: String,
          enum: ['planned', 'in_progress', 'completed', 'cancelled']
        },
        startDate: Date,
        targetCompletion: Date,
        actualCompletion: Date,
        effort: {
          estimated: Number,
          actual: Number,
          unit: String
        },
        cost: {
          estimated: Number,
          actual: Number,
          approved: Boolean
        },
        outcome: String
      }],
      mentor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consultant'
      },
      resources: [{
        type: {
          type: String,
          enum: ['book', 'course', 'video', 'documentation', 'community', 'tool']
        },
        title: String,
        url: String,
        cost: Number,
        recommended: Boolean,
        completed: Boolean
      }],
      milestones: [{
        milestone: String,
        targetDate: Date,
        achieved: Boolean,
        achievedDate: Date,
        evidence: String
      }],
      investmentRequired: {
        time: {
          hours: Number,
          timeline: String
        },
        money: {
          amount: Number,
          currency: String,
          approved: Boolean
        }
      },
      expectedROI: {
        description: String,
        timeframe: String,
        metrics: [String]
      }
    },
    gap: {
      currentToTarget: Number,
      requiredForRole: Number,
      marketExpectation: Number,
      criticalGaps: [String],
      improvementRate: Number
    },
    history: [{
      date: Date,
      previousLevel: Number,
      newLevel: Number,
      trigger: {
        type: String,
        enum: ['training', 'project', 'certification', 'assessment', 'experience']
      },
      description: String,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    recommendations: [{
      recommendation: String,
      source: {
        type: String,
        enum: ['system', 'manager', 'mentor', 'peer', 'self']
      },
      priority: {
        type: String,
        enum: ['immediate', 'short_term', 'medium_term', 'long_term']
      },
      rationale: String,
      resources: [String],
      estimatedImprovement: Number
    }]
  },

  // ==================== Market & Demand ====================
  market: {
    demand: {
      current: {
        type: String,
        enum: ['very_high', 'high', 'moderate', 'low', 'very_low'],
        default: 'moderate'
      },
      trend: {
        type: String,
        enum: ['rapidly_increasing', 'increasing', 'stable', 'decreasing', 'rapidly_decreasing'],
        default: 'stable'
      },
      forecast: {
        sixMonths: String,
        oneYear: String,
        threeYears: String
      },
      lastUpdated: Date
    },
    compensation: {
      premium: {
        type: Number,
        default: 0
      },
      marketRate: {
        min: Number,
        max: Number,
        median: Number,
        currency: String
      },
      benchmarkSource: String,
      lastUpdated: Date
    },
    opportunities: {
      internal: [{
        projectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Project'
        },
        role: String,
        requiredLevel: Number,
        startDate: Date,
        duration: String,
        match: Number
      }],
      external: [{
        company: String,
        position: String,
        requiredLevel: Number,
        compensation: Number,
        location: String,
        remote: Boolean,
        posted: Date
      }],
      trends: [{
        trend: String,
        impact: {
          type: String,
          enum: ['positive', 'neutral', 'negative']
        },
        timeframe: String
      }]
    },
    competitors: [{
      consultantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consultant'
      },
      level: Number,
      rate: Number,
      availability: String,
      strengths: [String],
      weaknesses: [String]
    }],
    positioning: {
      uniqueness: {
        type: Number,
        min: 0,
        max: 100
      },
      competitiveness: {
        type: Number,
        min: 0,
        max: 100
      },
      marketFit: {
        type: Number,
        min: 0,
        max: 100
      },
      differentiators: [String]
    }
  },

  // ==================== Endorsements & Validation ====================
  endorsements: [{
    endorsedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    endorserRole: {
      type: String,
      enum: ['manager', 'peer', 'client', 'subordinate', 'partner', 'vendor']
    },
    relationship: {
      type: String,
      required: true
    },
    projectContext: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    level: {
      type: Number,
      min: 1,
      max: 10
    },
    specificExamples: [String],
    strengths: [String],
    areasForImprovement: [String],
    wouldRecommend: Boolean,
    date: {
      type: Date,
      default: Date.now
    },
    visibility: {
      type: String,
      enum: ['private', 'internal', 'public'],
      default: 'internal'
    },
    verified: Boolean,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  recommendations: [{
    fromConsultant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultant'
    },
    skillLevel: Number,
    context: String,
    projects: [String],
    date: Date,
    content: String,
    public: Boolean
  }],

  // ==================== Performance & Utilization ====================
  performance: {
    effectiveness: {
      qualityScore: {
        type: Number,
        min: 0,
        max: 100
      },
      deliveryScore: {
        type: Number,
        min: 0,
        max: 100
      },
      innovationScore: {
        type: Number,
        min: 0,
        max: 100
      },
      clientSatisfaction: {
        type: Number,
        min: 0,
        max: 100
      }
    },
    utilization: {
      frequency: {
        lastMonth: Number,
        lastQuarter: Number,
        lastYear: Number
      },
      projects: {
        total: Number,
        asPrimary: Number,
        asSecondary: Number
      },
      hours: {
        total: Number,
        billable: Number,
        training: Number
      }
    },
    impact: {
      projectsInfluenced: Number,
      revenueGenerated: Number,
      costSaved: Number,
      processesImproved: Number,
      peopleTrailed: Number,
      innovationsCreated: Number
    },
    recognition: [{
      type: {
        type: String,
        enum: ['award', 'commendation', 'certification', 'publication', 'speaking']
      },
      title: String,
      issuedBy: String,
      date: Date,
      description: String,
      url: String
    }],
    feedback: {
      positive: [{
        source: String,
        comment: String,
        date: Date,
        project: String
      }],
      constructive: [{
        source: String,
        area: String,
        suggestion: String,
        date: Date,
        addressed: Boolean
      }]
    }
  },

  // ==================== Knowledge Management ====================
  knowledge: {
    documentation: [{
      type: {
        type: String,
        enum: ['guide', 'tutorial', 'reference', 'best_practices', 'lessons_learned', 'case_study']
      },
      title: String,
      description: String,
      url: String,
      version: String,
      created: Date,
      updated: Date,
      downloads: Number,
      rating: Number,
      feedback: [String]
    }],
    contributions: [{
      type: {
        type: String,
        enum: ['code', 'documentation', 'framework', 'tool', 'methodology', 'standard']
      },
      title: String,
      description: String,
      repository: String,
      impact: String,
      users: Number,
      date: Date
    }],
    mentoring: {
      provided: [{
        menteeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Consultant'
        },
        topics: [String],
        duration: String,
        outcome: String,
        feedback: String
      }],
      received: [{
        mentorId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Consultant'
        },
        topics: [String],
        duration: String,
        learnings: [String],
        applied: Boolean
      }]
    },
    communities: [{
      name: String,
      platform: String,
      role: {
        type: String,
        enum: ['member', 'contributor', 'moderator', 'leader', 'expert']
      },
      contributions: Number,
      reputation: Number,
      joinedDate: Date,
      active: Boolean
    }],
    patents: [{
      title: String,
      number: String,
      date: Date,
      status: {
        type: String,
        enum: ['pending', 'granted', 'expired', 'abandoned']
      },
      coInventors: [String],
      description: String
    }]
  },

  // ==================== Analytics & Insights ====================
  analytics: {
    competencyScore: {
      technical: Number,
      theoretical: Number,
      practical: Number,
      overall: Number,
      percentile: Number,
      lastCalculated: Date
    },
    learningVelocity: {
      current: Number,
      average: Number,
      trend: {
        type: String,
        enum: ['accelerating', 'steady', 'slowing', 'stagnant']
      },
      projectedMastery: Date
    },
    utilizationTrend: {
      increasing: Boolean,
      rate: Number,
      projection: String
    },
    marketAlignment: {
      score: Number,
      gaps: [String],
      opportunities: [String],
      recommendations: [String]
    },
    roi: {
      investmentToDate: Number,
      valueGenerated: Number,
      projectedValue: Number,
      breakEvenDate: Date,
      returnMultiple: Number
    },
    comparative: {
      vsPeers: {
        percentile: Number,
        strengths: [String],
        gaps: [String]
      },
      vsMarket: {
        percentile: Number,
        competitiveness: Number,
        uniqueness: Number
      },
      vsTarget: {
        gapPercentage: Number,
        timeToTarget: String,
        feasibility: Number
      }
    }
  },

  // ==================== Metadata ====================
  metadata: {
    source: {
      type: String,
      enum: ['self_reported', 'assessed', 'verified', 'imported', 'inferred'],
      default: 'self_reported'
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    lastReviewed: Date,
    lastUpdated: Date,
    nextReviewDate: Date,
    updateFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'annually'],
      default: 'quarterly'
    },
    visibility: {
      internal: {
        type: Boolean,
        default: true
      },
      external: {
        type: Boolean,
        default: false
      },
      client: {
        type: Boolean,
        default: false
      }
    },
    tags: [String],
    notes: [{
      note: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date,
      type: {
        type: String,
        enum: ['observation', 'feedback', 'plan', 'concern', 'achievement']
      }
    }],
    flags: {
      critical: {
        type: Boolean,
        default: false
      },
      scarce: {
        type: Boolean,
        default: false
      },
      declining: {
        type: Boolean,
        default: false
      },
      emerging: {
        type: Boolean,
        default: false
      }
    },
    version: {
      type: Number,
      default: 1
    }
  },

  // ==================== Status & Lifecycle ====================
  status: {
    current: {
      type: String,
      enum: ['active', 'dormant', 'expired', 'deprecated', 'archived'],
      default: 'active',
      index: true
    },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'disputed'],
      default: 'unverified'
    },
    validUntil: Date,
    requiresRefresh: Boolean,
    refreshBy: Date,
    lastActivity: Date
  },

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false
  },

  // ==================== Deletion & Archival ====================
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
};

// Create schema
const consultantSkillSchema = BaseModel.createSchema(consultantSkillSchemaDefinition, {
  collection: 'consultant_skills',
  timestamps: true
});

// ==================== Indexes ====================
consultantSkillSchema.index({ tenantId: 1, consultantId: 1, 'skill.name': 1 }, { unique: true });
consultantSkillSchema.index({ tenantId: 1, skillId: 1 }, { unique: true });
consultantSkillSchema.index({ tenantId: 1, 'skill.category.primary': 1 });
consultantSkillSchema.index({ tenantId: 1, 'proficiency.currentLevel': -1 });
consultantSkillSchema.index({ tenantId: 1, 'market.demand.current': 1 });
consultantSkillSchema.index({ tenantId: 1, 'development.priority': 1 });
consultantSkillSchema.index({ tenantId: 1, status: 1 });
consultantSkillSchema.index({ tenantId: 1, searchTokens: 1 });

// Text search index
consultantSkillSchema.index({
  'skill.name': 'text',
  'skill.description': 'text',
  'skill.aliases': 'text'
});

// ==================== Virtual Fields ====================
consultantSkillSchema.virtual('proficiencyLevel').get(function() {
  return this.proficiency.calculatedLevel?.value || this.proficiency.currentLevel || 0;
});

consultantSkillSchema.virtual('isVerified').get(function() {
  return this.status.verificationStatus === 'verified';
});

consultantSkillSchema.virtual('yearsOfExperience').get(function() {
  return this.experience.totalYears || 0;
});

consultantSkillSchema.virtual('hasCertification').get(function() {
  return this.certifications && this.certifications.some(c => c.status === 'active');
});

consultantSkillSchema.virtual('developmentRequired').get(function() {
  if (!this.proficiency.targetLevel) return false;
  return this.proficiency.currentLevel < this.proficiency.targetLevel;
});

consultantSkillSchema.virtual('marketValue').get(function() {
  const demand = {
    'very_high': 5,
    'high': 4,
    'moderate': 3,
    'low': 2,
    'very_low': 1
  };
  
  const level = this.proficiency.currentLevel || 0;
  const demandScore = demand[this.market.demand.current] || 3;
  
  return (level * demandScore) / 2;
});

// ==================== Pre-save Middleware ====================
consultantSkillSchema.pre('save', async function(next) {
  try {
    // Generate skill ID if not provided
    if (!this.skillId && this.isNew) {
      this.skillId = await this.constructor.generateSkillId();
    }

    // Update search tokens
    this.updateSearchTokens();

    // Calculate proficiency level
    this.calculateProficiencyLevel();

    // Update experience metrics
    if (this.isModified('experience.projects')) {
      this.updateExperienceMetrics();
    }

    // Check if skill needs refresh
    this.checkRefreshRequired();

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
consultantSkillSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add skill name tokens
  if (this.skill?.name) {
    this.skill.name.toLowerCase().split(/[\s-_.]/).forEach(token => {
      if (token) tokens.add(token);
    });
  }
  
  // Add aliases
  if (this.skill?.aliases) {
    this.skill.aliases.forEach(alias => {
      alias.toLowerCase().split(/[\s-_.]/).forEach(token => {
        if (token) tokens.add(token);
      });
    });
  }
  
  // Add category
  if (this.skill?.category?.secondary) {
    this.skill.category.secondary.toLowerCase().split(/[\s-_]/).forEach(token => {
      if (token) tokens.add(token);
    });
  }
  
  // Add tags
  if (this.skill?.category?.tags) {
    this.skill.category.tags.forEach(tag => {
      tag.toLowerCase().split(/[\s-_]/).forEach(token => {
        if (token) tokens.add(token);
      });
    });
  }
  
  this.searchTokens = Array.from(tokens);
};

consultantSkillSchema.methods.calculateProficiencyLevel = function() {
  const assessments = [];
  
  // Collect all assessments with weights
  if (this.proficiency.selfAssessment?.level) {
    assessments.push({ level: this.proficiency.selfAssessment.level, weight: 0.2 });
  }
  
  if (this.proficiency.managerAssessment?.level) {
    assessments.push({ level: this.proficiency.managerAssessment.level, weight: 0.3 });
  }
  
  if (this.proficiency.formalAssessment?.level) {
    assessments.push({ level: this.proficiency.formalAssessment.level, weight: 0.3 });
  }
  
  // Add peer assessments (average)
  if (this.proficiency.peerAssessments?.length > 0) {
    const peerAvg = this.proficiency.peerAssessments.reduce((sum, a) => sum + a.level, 0) / 
                    this.proficiency.peerAssessments.length;
    assessments.push({ level: peerAvg, weight: 0.1 });
  }
  
  // Add client assessments (average)
  if (this.proficiency.clientAssessments?.length > 0) {
    const clientAvg = this.proficiency.clientAssessments.reduce((sum, a) => sum + a.level, 0) / 
                      this.proficiency.clientAssessments.length;
    assessments.push({ level: clientAvg, weight: 0.1 });
  }
  
  if (assessments.length > 0) {
    // Calculate weighted average
    const totalWeight = assessments.reduce((sum, a) => sum + a.weight, 0);
    const weightedSum = assessments.reduce((sum, a) => sum + (a.level * a.weight), 0);
    const calculatedLevel = weightedSum / totalWeight;
    
    // Calculate confidence based on number of assessments
    const confidence = Math.min(100, assessments.length * 20);
    
    this.proficiency.calculatedLevel = {
      value: Math.round(calculatedLevel * 10) / 10,
      method: 'weighted',
      confidence,
      lastCalculated: new Date()
    };
    
    // Update current level if significantly different
    if (Math.abs(this.proficiency.currentLevel - calculatedLevel) > 0.5) {
      this.proficiency.currentLevel = Math.round(calculatedLevel);
    }
  }
};

consultantSkillSchema.methods.updateExperienceMetrics = function() {
  if (!this.experience.projects || this.experience.projects.length === 0) {
    this.experience.totalYears = 0;
    this.experience.recentYears = 0;
    return;
  }
  
  // Calculate date ranges
  const now = new Date();
  const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
  
  let earliestDate = now;
  let latestDate = new Date(0);
  let recentMonths = 0;
  
  this.experience.projects.forEach(project => {
    if (project.period?.start) {
      if (project.period.start < earliestDate) {
        earliestDate = project.period.start;
      }
      
      const endDate = project.period.end || now;
      if (endDate > latestDate) {
        latestDate = endDate;
      }
      
      // Calculate recent experience
      if (endDate >= threeYearsAgo) {
        const projectStart = project.period.start > threeYearsAgo ? project.period.start : threeYearsAgo;
        recentMonths += Math.floor((endDate - projectStart) / (1000 * 60 * 60 * 24 * 30));
      }
    }
  });
  
  this.experience.firstUsed = earliestDate;
  this.experience.lastUsed = latestDate;
  this.experience.totalYears = Math.round((now - earliestDate) / (1000 * 60 * 60 * 24 * 365) * 10) / 10;
  this.experience.recentYears = Math.round(recentMonths / 12 * 10) / 10;
  
  // Determine frequency based on recent usage
  const monthsSinceLastUse = Math.floor((now - latestDate) / (1000 * 60 * 60 * 24 * 30));
  if (monthsSinceLastUse < 1) {
    this.experience.frequency = 'daily';
  } else if (monthsSinceLastUse < 3) {
    this.experience.frequency = 'weekly';
  } else if (monthsSinceLastUse < 6) {
    this.experience.frequency = 'monthly';
  } else if (monthsSinceLastUse < 12) {
    this.experience.frequency = 'quarterly';
  } else {
    this.experience.frequency = 'rarely';
  }
};

consultantSkillSchema.methods.checkRefreshRequired = function() {
  const now = new Date();
  const lastActivity = this.status.lastActivity || this.createdAt;
  const monthsSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24 * 30));
  
  // Skills need refresh based on complexity and last activity
  const refreshMonths = {
    'basic': 12,
    'intermediate': 9,
    'advanced': 6,
    'expert': 3,
    'specialist': 3
  };
  
  const threshold = refreshMonths[this.skill.complexity] || 6;
  
  if (monthsSinceActivity >= threshold) {
    this.status.requiresRefresh = true;
    this.status.refreshBy = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  }
  
  // Check if skill is becoming dormant
  if (monthsSinceActivity >= 12 && this.experience.frequency === 'rarely') {
    this.status.current = 'dormant';
  }
};

consultantSkillSchema.methods.addEndorsement = async function(endorsementData) {
  const endorsement = {
    endorsedBy: endorsementData.endorsedBy,
    endorserRole: endorsementData.role,
    relationship: endorsementData.relationship,
    projectContext: endorsementData.projectId,
    level: endorsementData.level,
    specificExamples: endorsementData.examples || [],
    strengths: endorsementData.strengths || [],
    areasForImprovement: endorsementData.improvements || [],
    wouldRecommend: endorsementData.recommend !== false,
    date: new Date(),
    visibility: endorsementData.visibility || 'internal',
    verified: false
  };
  
  this.endorsements.push(endorsement);
  
  // Recalculate proficiency if endorsed level is provided
  if (endorsement.level) {
    this.calculateProficiencyLevel();
  }
  
  await this.save();
  return endorsement;
};

consultantSkillSchema.methods.recordUsage = async function(projectData) {
  const usage = {
    projectId: projectData.projectId,
    projectName: projectData.name,
    clientId: projectData.clientId,
    role: projectData.role,
    period: projectData.period,
    usage: projectData.usage || 'secondary',
    complexity: projectData.complexity || 'moderate',
    achievements: projectData.achievements || [],
    challenges: projectData.challenges || [],
    learnings: projectData.learnings || []
  };
  
  if (!this.experience.projects) {
    this.experience.projects = [];
  }
  
  this.experience.projects.push(usage);
  
  // Update experience metrics
  this.updateExperienceMetrics();
  
  // Update last activity
  this.status.lastActivity = new Date();
  
  // Update performance metrics
  if (!this.performance.utilization.projects) {
    this.performance.utilization.projects = { total: 0, asPrimary: 0, asSecondary: 0 };
  }
  
  this.performance.utilization.projects.total += 1;
  if (usage.usage === 'primary') {
    this.performance.utilization.projects.asPrimary += 1;
  } else {
    this.performance.utilization.projects.asSecondary += 1;
  }
  
  await this.save();
  return usage;
};

consultantSkillSchema.methods.updateDevelopmentPlan = async function(planData) {
  if (!this.development.plan) {
    this.development.plan = {};
  }
  
  Object.assign(this.development.plan, {
    objectives: planData.objectives || this.development.plan.objectives,
    activities: planData.activities || this.development.plan.activities,
    mentor: planData.mentorId || this.development.plan.mentor,
    resources: planData.resources || this.development.plan.resources,
    milestones: planData.milestones || this.development.plan.milestones,
    investmentRequired: planData.investment || this.development.plan.investmentRequired,
    expectedROI: planData.roi || this.development.plan.expectedROI
  });
  
  // Update development status
  if (planData.activities && planData.activities.some(a => a.status === 'in_progress')) {
    this.development.status = 'learning';
  }
  
  // Calculate gap if target level is set
  if (this.proficiency.targetLevel) {
    this.development.gap = {
      currentToTarget: this.proficiency.targetLevel - this.proficiency.currentLevel,
      requiredForRole: planData.requiredLevel ? planData.requiredLevel - this.proficiency.currentLevel : 0,
      marketExpectation: planData.marketLevel ? planData.marketLevel - this.proficiency.currentLevel : 0,
      criticalGaps: planData.criticalGaps || [],
      improvementRate: planData.improvementRate || 0
    };
  }
  
  await this.save();
  return this.development.plan;
};

// ==================== Static Methods ====================
consultantSkillSchema.statics.generateSkillId = async function() {
  const prefix = 'SKL';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;
  
  while (exists) {
    let random = '';
    for (let i = 0; i < 8; i++) {
      random += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    code = `${prefix}-${random}`;
    
    const existing = await this.findOne({ skillId: code });
    exists = !!existing;
  }
  
  return code;
};

consultantSkillSchema.statics.getSkillsMatrix = async function(consultantId, tenantId) {
  const skills = await this.find({
    consultantId,
    tenantId,
    isDeleted: false,
    'status.current': { $ne: 'archived' }
  }).sort({ 'proficiency.currentLevel': -1, 'skill.name': 1 });
  
  // Group by category
  const matrix = {};
  
  skills.forEach(skill => {
    const category = skill.skill.category.primary;
    if (!matrix[category]) {
      matrix[category] = {
        skills: [],
        averageLevel: 0,
        totalSkills: 0,
        verified: 0,
        developing: 0
      };
    }
    
    matrix[category].skills.push({
      name: skill.skill.name,
      level: skill.proficiency.currentLevel,
      targetLevel: skill.proficiency.targetLevel,
      verified: skill.isVerified,
      hasCertification: skill.hasCertification,
      lastUsed: skill.experience.lastUsed,
      demand: skill.market.demand.current
    });
    
    matrix[category].totalSkills += 1;
    matrix[category].averageLevel += skill.proficiency.currentLevel;
    if (skill.isVerified) matrix[category].verified += 1;
    if (skill.developmentRequired) matrix[category].developing += 1;
  });
  
  // Calculate averages
  Object.keys(matrix).forEach(category => {
    matrix[category].averageLevel = matrix[category].averageLevel / matrix[category].totalSkills;
  });
  
  return matrix;
};

consultantSkillSchema.statics.findMarketableSkills = async function(tenantId, options = {}) {
  const {
    minDemand = 'moderate',
    categories = [],
    minLevel = 5,
    limit = 20
  } = options;
  
  const demandLevels = ['very_low', 'low', 'moderate', 'high', 'very_high'];
  const minDemandIndex = demandLevels.indexOf(minDemand);
  const validDemands = demandLevels.slice(minDemandIndex);
  
  const query = {
    tenantId,
    isDeleted: false,
    'market.demand.current': { $in: validDemands },
    'proficiency.currentLevel': { $gte: minLevel },
    'status.current': 'active'
  };
  
  if (categories.length > 0) {
    query['skill.category.primary'] = { $in: categories };
  }
  
  return await this.find(query)
    .populate('consultantId', 'personalInfo.firstName personalInfo.lastName')
    .sort({ 'market.demand.current': -1, 'proficiency.currentLevel': -1 })
    .limit(limit);
};

// ==================== Create Model ====================
const ConsultantSkillModel = BaseModel.createModel('ConsultantSkill', consultantSkillSchema, {
  collection: 'consultant_skills',
  enableTimestamps: true,
  enableAudit: true,
  enableSoftDelete: true
});

module.exports = ConsultantSkillModel;