'use strict';

/**
 * @fileoverview Enhanced consultant profile model with comprehensive career and expertise management
 * @module servers/customer-services/modules/core-business/consultants/models/consultant-profile-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../../shared/lib/utils/helpers/string-helper');
const EncryptionService = require('../../../../../../shared/lib/security/encryption/encryption-service');

/**
 * Enhanced consultant profile schema for comprehensive professional management
 */
const consultantProfileSchemaDefinition = {
  // ==================== Core Identity ====================
  profileId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^PRF-[A-Z0-9]{8}$/,
    index: true,
    immutable: true
  },

  consultantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultant',
    required: true,
    unique: true,
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

  // ==================== Professional Summary ====================
  summary: {
    headline: {
      type: String,
      required: true,
      maxlength: 200
    },
    executiveSummary: {
      type: String,
      required: true,
      maxlength: 2000
    },
    keyStrengths: [{
      strength: String,
      description: String,
      examples: [String]
    }],
    uniqueValueProposition: {
      type: String,
      maxlength: 500
    },
    careerHighlights: [{
      highlight: String,
      impact: String,
      year: Number
    }],
    professionalStatement: {
      type: String,
      maxlength: 1000
    },
    targetRoles: [String],
    careerObjectives: {
      shortTerm: String,
      longTerm: String,
      aspirations: [String]
    }
  },

  // ==================== Career History ====================
  careerHistory: [{
    company: {
      name: {
        type: String,
        required: true
      },
      industry: String,
      size: {
        type: String,
        enum: ['startup', 'small', 'medium', 'large', 'enterprise', 'fortune500']
      },
      location: String,
      website: String
    },
    position: {
      title: {
        type: String,
        required: true
      },
      level: {
        type: String,
        enum: ['entry', 'junior', 'mid', 'senior', 'lead', 'manager', 'director', 'executive']
      },
      department: String,
      reportingTo: String
    },
    duration: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: Date,
      isCurrent: {
        type: Boolean,
        default: false
      },
      totalMonths: Number
    },
    responsibilities: [{
      description: String,
      category: {
        type: String,
        enum: ['management', 'technical', 'client', 'strategic', 'operational', 'financial']
      }
    }],
    achievements: [{
      achievement: String,
      impact: String,
      metrics: String,
      recognition: String
    }],
    projects: [{
      name: String,
      role: String,
      description: String,
      outcome: String,
      technologies: [String],
      teamSize: Number,
      budget: Number,
      duration: String
    }],
    skillsDeveloped: [String],
    reasonForLeaving: {
      type: String,
      select: false
    },
    references: [{
      name: String,
      title: String,
      relationship: String,
      contactInfo: {
        type: String,
        select: false
      },
      canContact: Boolean
    }],
    compensation: {
      salary: {
        type: Number,
        select: false
      },
      bonus: {
        type: Number,
        select: false
      },
      equity: String,
      benefits: [String]
    }
  }],

  // ==================== Expertise Areas ====================
  expertise: {
    domains: [{
      domain: {
        type: String,
        required: true
      },
      level: {
        type: String,
        enum: ['aware', 'working', 'practitioner', 'expert', 'thought_leader'],
        required: true
      },
      yearsOfExperience: Number,
      description: String,
      keyProjects: [String],
      publications: [String],
      recognition: [String],
      currentRelevance: {
        type: String,
        enum: ['cutting_edge', 'current', 'established', 'legacy']
      }
    }],
    industries: [{
      industry: {
        type: String,
        required: true
      },
      subSectors: [String],
      experience: {
        years: Number,
        depth: {
          type: String,
          enum: ['surface', 'moderate', 'deep', 'comprehensive']
        }
      },
      clients: [{
        name: String,
        tier: {
          type: String,
          enum: ['fortune500', 'enterprise', 'mid_market', 'smb', 'startup']
        },
        engagement: String
      }],
      regulations: [String],
      trends: [String],
      challenges: [String]
    }],
    functionalAreas: [{
      area: {
        type: String,
        required: true
      },
      subAreas: [String],
      proficiency: {
        type: String,
        enum: ['basic', 'intermediate', 'advanced', 'expert']
      },
      frameworks: [String],
      tools: [String],
      bestPractices: [String],
      caseStudies: [{
        title: String,
        client: String,
        challenge: String,
        solution: String,
        outcome: String,
        metrics: String
      }]
    }],
    technologies: [{
      category: String,
      technologies: [{
        name: String,
        version: String,
        proficiency: {
          type: String,
          enum: ['beginner', 'intermediate', 'advanced', 'expert']
        },
        yearsUsed: Number,
        lastUsed: Date,
        certified: Boolean,
        projects: Number
      }]
    }],
    methodologies: [{
      methodology: String,
      category: {
        type: String,
        enum: ['agile', 'project_management', 'quality', 'process', 'strategy', 'analysis']
      },
      certificationLevel: String,
      practitionerSince: Date,
      projectsApplied: Number,
      trainingProvided: Boolean
    }],
    softSkills: [{
      skill: String,
      level: {
        type: String,
        enum: ['developing', 'competent', 'proficient', 'expert']
      },
      evidence: [String],
      feedback: [{
        source: String,
        comment: String,
        date: Date
      }]
    }]
  },

  // ==================== Qualifications & Credentials ====================
  qualifications: {
    academic: [{
      level: {
        type: String,
        enum: ['high_school', 'associate', 'bachelor', 'master', 'doctorate', 'post_doc']
      },
      degree: String,
      major: String,
      minor: String,
      institution: {
        name: String,
        location: String,
        ranking: String,
        accreditation: String
      },
      duration: {
        startDate: Date,
        endDate: Date
      },
      grade: {
        gpa: Number,
        scale: Number,
        class: String,
        percentile: Number
      },
      honors: [String],
      awards: [String],
      thesis: {
        title: String,
        advisor: String,
        abstract: String,
        published: Boolean
      },
      relevantCourses: [{
        code: String,
        name: String,
        grade: String,
        credits: Number
      }],
      extracurricular: [String]
    }],
    professional: [{
      certification: {
        name: String,
        acronym: String,
        issuingBody: String,
        level: String
      },
      credentials: {
        number: String,
        issueDate: Date,
        expiryDate: Date,
        status: {
          type: String,
          enum: ['active', 'expired', 'suspended', 'revoked', 'pending_renewal']
        }
      },
      maintenance: {
        cpdRequired: Boolean,
        cpdHours: Number,
        renewalFee: Number,
        lastRenewal: Date,
        nextRenewal: Date
      },
      preparation: {
        studyHours: Number,
        attempts: Number,
        score: Number,
        percentile: Number
      },
      benefits: [String],
      projects: [String]
    }],
    licenses: [{
      type: String,
      number: String,
      issuingAuthority: String,
      jurisdiction: String,
      issueDate: Date,
      expiryDate: Date,
      restrictions: [String],
      endorsements: [String],
      status: {
        type: String,
        enum: ['active', 'inactive', 'suspended', 'revoked']
      }
    }],
    clearances: [{
      type: {
        type: String,
        enum: ['security', 'background', 'credit', 'criminal', 'drug']
      },
      level: String,
      issuedBy: String,
      issueDate: Date,
      expiryDate: Date,
      investigationType: String,
      adjudicationDate: Date,
      polygraphDate: Date,
      reinvestigationDate: Date
    }]
  },

  // ==================== Skills Matrix ====================
  skillsMatrix: {
    technical: [{
      category: String,
      skills: [{
        name: String,
        currentLevel: {
          type: Number,
          min: 1,
          max: 10
        },
        targetLevel: {
          type: Number,
          min: 1,
          max: 10
        },
        lastAssessed: Date,
        assessedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        evidence: [{
          type: {
            type: String,
            enum: ['project', 'certification', 'training', 'assessment', 'peer_review']
          },
          description: String,
          date: Date,
          verifier: String
        }],
        developmentPlan: {
          actions: [String],
          timeline: String,
          resources: [String],
          budget: Number
        }
      }]
    }],
    business: [{
      competency: String,
      currentLevel: {
        type: Number,
        min: 1,
        max: 5
      },
      importance: {
        type: String,
        enum: ['nice_to_have', 'important', 'critical']
      },
      gaps: [String],
      developmentActions: [String]
    }],
    leadership: [{
      trait: String,
      assessment: {
        selfScore: Number,
        managerScore: Number,
        peerScore: Number,
        subordinateScore: Number,
        overallScore: Number
      },
      behaviors: [String],
      developmentNeeds: [String],
      coachingFocus: [String]
    }],
    languages: [{
      language: String,
      speaking: {
        type: String,
        enum: ['none', 'basic', 'conversational', 'professional', 'fluent', 'native']
      },
      writing: {
        type: String,
        enum: ['none', 'basic', 'conversational', 'professional', 'fluent', 'native']
      },
      reading: {
        type: String,
        enum: ['none', 'basic', 'conversational', 'professional', 'fluent', 'native']
      },
      businessProficiency: Boolean,
      certifications: [{
        test: String,
        score: String,
        date: Date
      }]
    }]
  },

  // ==================== Portfolio & Showcase ====================
  portfolio: {
    projects: [{
      projectId: String,
      title: {
        type: String,
        required: true
      },
      client: {
        name: String,
        industry: String,
        confidential: Boolean
      },
      period: {
        start: Date,
        end: Date,
        duration: String
      },
      role: {
        title: String,
        responsibilities: [String],
        teamSize: Number,
        reportingTo: String
      },
      scope: {
        description: String,
        objectives: [String],
        deliverables: [String],
        budget: Number,
        complexity: {
          type: String,
          enum: ['simple', 'moderate', 'complex', 'highly_complex']
        }
      },
      approach: {
        methodology: String,
        phases: [{
          name: String,
          duration: String,
          activities: [String],
          deliverables: [String]
        }],
        tools: [String],
        techniques: [String]
      },
      outcomes: {
        achievements: [String],
        metrics: [{
          metric: String,
          baseline: String,
          target: String,
          achieved: String
        }],
        clientTestimonial: String,
        awards: [String],
        lessonsLearned: [String]
      },
      artifacts: [{
        type: {
          type: String,
          enum: ['document', 'presentation', 'code', 'design', 'report', 'video']
        },
        title: String,
        description: String,
        url: String,
        confidential: Boolean
      }],
      skills: [String],
      keywords: [String],
      showcase: {
        featured: Boolean,
        order: Number,
        thumbnail: String,
        summary: String
      }
    }],
    publications: [{
      type: {
        type: String,
        enum: ['article', 'whitepaper', 'book', 'chapter', 'research', 'blog', 'case_study']
      },
      title: String,
      authors: [String],
      publication: {
        name: String,
        type: {
          type: String,
          enum: ['journal', 'magazine', 'conference', 'book', 'online', 'company']
        },
        publisher: String,
        issn: String,
        isbn: String
      },
      date: Date,
      abstract: String,
      url: String,
      doi: String,
      citations: Number,
      downloads: Number,
      peerReviewed: Boolean,
      impact: String
    }],
    presentations: [{
      title: String,
      event: {
        name: String,
        type: {
          type: String,
          enum: ['conference', 'seminar', 'workshop', 'webinar', 'internal', 'client']
        },
        organizer: String,
        location: String,
        virtual: Boolean
      },
      date: Date,
      audience: {
        size: Number,
        type: String,
        level: String
      },
      topics: [String],
      format: {
        type: String,
        enum: ['keynote', 'panel', 'workshop', 'tutorial', 'lightning', 'poster']
      },
      duration: Number,
      materials: [{
        type: String,
        url: String
      }],
      recording: String,
      feedback: {
        rating: Number,
        comments: [String]
      }
    }],
    media: [{
      type: {
        type: String,
        enum: ['interview', 'podcast', 'article', 'quote', 'video', 'panel']
      },
      outlet: String,
      title: String,
      date: Date,
      topic: String,
      url: String,
      reach: Number,
      highlights: [String]
    }]
  },

  // ==================== Professional Development ====================
  development: {
    currentPlan: {
      year: Number,
      goals: [{
        goal: String,
        category: {
          type: String,
          enum: ['technical', 'leadership', 'business', 'certification', 'soft_skills']
        },
        priority: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical']
        },
        timeline: {
          start: Date,
          target: Date
        },
        milestones: [{
          milestone: String,
          dueDate: Date,
          completed: Boolean,
          completedDate: Date
        }],
        resources: [{
          type: String,
          description: String,
          cost: Number,
          approved: Boolean
        }],
        progress: {
          percentage: Number,
          lastUpdated: Date,
          blockers: [String]
        },
        outcomes: [String]
      }],
      budget: {
        allocated: Number,
        spent: Number,
        remaining: Number
      },
      manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      nextReview: Date
    },
    completedTraining: [{
      course: {
        name: String,
        provider: String,
        format: {
          type: String,
          enum: ['online', 'classroom', 'blended', 'self_paced', 'workshop']
        }
      },
      period: {
        start: Date,
        end: Date,
        hours: Number
      },
      completion: {
        date: Date,
        score: Number,
        grade: String,
        certificate: String
      },
      skills: [String],
      applicability: {
        immediate: Boolean,
        projects: [String],
        roleRelevance: {
          type: String,
          enum: ['not_relevant', 'somewhat_relevant', 'relevant', 'highly_relevant']
        }
      },
      feedback: {
        quality: Number,
        usefulness: Number,
        wouldRecommend: Boolean,
        comments: String
      },
      cost: {
        tuition: Number,
        materials: Number,
        travel: Number,
        total: Number,
        reimbursed: Boolean
      }
    }],
    mentoring: {
      asMentor: [{
        mentee: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Consultant'
        },
        period: {
          start: Date,
          end: Date,
          status: {
            type: String,
            enum: ['active', 'completed', 'paused', 'terminated']
          }
        },
        focus: [String],
        frequency: String,
        achievements: [String],
        feedback: String
      }],
      asMentee: [{
        mentor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Consultant'
        },
        period: {
          start: Date,
          end: Date,
          status: {
            type: String,
            enum: ['active', 'completed', 'paused', 'terminated']
          }
        },
        objectives: [String],
        learnings: [String],
        feedback: String
      }]
    },
    coaching: [{
      coach: {
        name: String,
        organization: String,
        credentials: [String]
      },
      program: {
        name: String,
        type: {
          type: String,
          enum: ['executive', 'leadership', 'performance', 'career', 'skills']
        },
        duration: String,
        sessions: Number
      },
      period: {
        start: Date,
        end: Date
      },
      goals: [String],
      outcomes: [String],
      assessments: [{
        tool: String,
        date: Date,
        results: String
      }],
      actionPlan: [String],
      investment: Number
    }],
    conferences: [{
      name: String,
      organizer: String,
      location: String,
      date: Date,
      role: {
        type: String,
        enum: ['attendee', 'speaker', 'panelist', 'organizer', 'volunteer']
      },
      sessions: [String],
      networking: [{
        contact: String,
        company: String,
        followUp: Boolean
      }],
      keyTakeaways: [String],
      cost: Number,
      approved: Boolean
    }]
  },

  // ==================== Performance & Recognition ====================
  performance: {
    ratings: [{
      period: {
        year: Number,
        quarter: Number
      },
      scores: {
        overall: Number,
        technical: Number,
        delivery: Number,
        leadership: Number,
        innovation: Number,
        collaboration: Number,
        clientFocus: Number
      },
      percentile: Number,
      calibrated: Boolean,
      feedback: {
        strengths: [String],
        improvements: [String],
        examples: [String]
      },
      reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reviewDate: Date
    }],
    achievements: [{
      title: String,
      category: {
        type: String,
        enum: ['project', 'innovation', 'leadership', 'sales', 'operational', 'cultural']
      },
      description: String,
      impact: {
        description: String,
        metrics: [String],
        value: Number,
        beneficiaries: [String]
      },
      recognition: {
        type: {
          type: String,
          enum: ['award', 'bonus', 'promotion', 'commendation', 'certification']
        },
        details: String,
        date: Date,
        monetary: Number
      },
      visibility: {
        type: String,
        enum: ['team', 'department', 'company', 'public']
      }
    }],
    feedback360: [{
      cycle: String,
      date: Date,
      participants: {
        self: Boolean,
        manager: Number,
        peers: Number,
        subordinates: Number,
        clients: Number
      },
      results: {
        strengths: [String],
        blindSpots: [String],
        hiddenStrengths: [String],
        developmentAreas: [String]
      },
      themes: [{
        theme: String,
        frequency: Number,
        sentiment: {
          type: String,
          enum: ['positive', 'neutral', 'negative', 'mixed']
        },
        examples: [String]
      }],
      actionPlan: [{
        area: String,
        actions: [String],
        timeline: String,
        support: String
      }]
    }],
    competencyAssessment: [{
      date: Date,
      framework: String,
      competencies: [{
        name: String,
        required: Number,
        current: Number,
        gap: Number,
        evidence: [String],
        development: String
      }],
      overallGap: Number,
      readinessForNextLevel: {
        ready: Boolean,
        gaps: [String],
        timeline: String
      }
    }]
  },

  // ==================== Market Profile ====================
  marketProfile: {
    positioning: {
      level: {
        type: String,
        enum: ['junior', 'mid', 'senior', 'expert', 'thought_leader']
      },
      specialization: [String],
      differentiators: [String],
      competitiveAdvantage: String,
      targetMarket: {
        industries: [String],
        companySize: [String],
        geographies: [String],
        roles: [String]
      }
    },
    marketValue: {
      currentRate: {
        amount: Number,
        currency: String,
        unit: String
      },
      marketRate: {
        min: Number,
        max: Number,
        median: Number,
        source: String,
        lastUpdated: Date
      },
      premium: {
        percentage: Number,
        justification: [String]
      }
    },
    visibility: {
      internalProfile: {
        completeness: Number,
        lastUpdated: Date,
        views: Number
      },
      externalProfiles: [{
        platform: String,
        url: String,
        connections: Number,
        endorsements: Number,
        recommendations: Number,
        completeness: Number
      }],
      searchRankings: [{
        keyword: String,
        position: Number,
        platform: String,
        date: Date
      }],
      thoughtLeadership: {
        articles: Number,
        speakingEngagements: Number,
        mediaAppearances: Number,
        influence: {
          type: String,
          enum: ['local', 'regional', 'national', 'international']
        }
      }
    },
    reputation: {
      nps: Number,
      clientSatisfaction: Number,
      peerRating: Number,
      recommendations: [{
        from: String,
        role: String,
        company: String,
        relationship: String,
        content: String,
        date: Date,
        platform: String
      }],
      testimonials: [{
        client: String,
        project: String,
        quote: String,
        impact: String,
        permission: Boolean
      }],
      references: [{
        name: String,
        title: String,
        company: String,
        relationship: String,
        duration: String,
        contact: {
          type: String,
          select: false
        },
        willing: Boolean,
        lastContacted: Date
      }]
    },
    availability: {
      currentStatus: {
        type: String,
        enum: ['available', 'passive', 'not_looking', 'engaged']
      },
      nextAvailable: Date,
      noticeRequired: {
        value: Number,
        unit: {
          type: String,
          enum: ['days', 'weeks', 'months']
        }
      },
      preferences: {
        employment: [String],
        duration: {
          min: String,
          max: String
        },
        travel: Number,
        remote: Boolean,
        relocation: Boolean
      }
    }
  },

  // ==================== Analytics & Insights ====================
  analytics: {
    careerProgression: {
      promotions: [{
        from: String,
        to: String,
        date: Date,
        timeInRole: Number
      }],
      averageTimePerLevel: Number,
      trajectoryScore: Number,
      projectedNextLevel: {
        level: String,
        timeframe: String,
        probability: Number
      }
    },
    skillsGrowth: {
      skillsAdded: Number,
      skillsUpgraded: Number,
      certificationsEarned: Number,
      trainingsCompleted: Number,
      learningHours: Number,
      investmentROI: Number
    },
    marketDemand: {
      profileViews: Number,
      searchAppearances: Number,
      inquiries: Number,
      opportunities: Number,
      demandTrend: {
        type: String,
        enum: ['declining', 'stable', 'growing', 'high_growth']
      }
    },
    engagement: {
      projectSuccessRate: Number,
      clientRetention: Number,
      repeatBusiness: Number,
      referrals: Number,
      networkGrowth: Number
    },
    value: {
      revenueContribution: Number,
      profitability: Number,
      utilizationRate: Number,
      billableEfficiency: Number,
      costPerHour: Number,
      roi: Number
    }
  },

  // ==================== Metadata ====================
  metadata: {
    profileCompleteness: {
      percentage: Number,
      missingFields: [String],
      lastReviewDate: Date,
      nextReviewDate: Date
    },
    verification: {
      educationVerified: Boolean,
      employmentVerified: Boolean,
      certificationsVerified: Boolean,
      referencesChecked: Boolean,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      verifiedDate: Date
    },
    visibility: {
      internal: {
        type: String,
        enum: ['private', 'team', 'department', 'company'],
        default: 'company'
      },
      external: {
        type: String,
        enum: ['hidden', 'anonymous', 'partial', 'full'],
        default: 'partial'
      }
    },
    tags: [String],
    keywords: [String],
    version: {
      type: Number,
      default: 1
    }
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
const consultantProfileSchema = BaseModel.createSchema(consultantProfileSchemaDefinition, {
  collection: 'consultant_profiles',
  timestamps: true
});

// ==================== Indexes ====================
consultantProfileSchema.index({ tenantId: 1, profileId: 1 }, { unique: true });
consultantProfileSchema.index({ tenantId: 1, consultantId: 1 }, { unique: true });
consultantProfileSchema.index({ tenantId: 1, 'expertise.domains.domain': 1 });
consultantProfileSchema.index({ tenantId: 1, 'expertise.industries.industry': 1 });
consultantProfileSchema.index({ tenantId: 1, 'marketProfile.marketValue.currentRate.amount': 1 });
consultantProfileSchema.index({ tenantId: 1, searchTokens: 1 });
consultantProfileSchema.index({ tenantId: 1, createdAt: -1 });

// Text search index
consultantProfileSchema.index({
  'summary.headline': 'text',
  'summary.executiveSummary': 'text',
  'portfolio.projects.title': 'text',
  'expertise.domains.domain': 'text'
});

// ==================== Virtual Fields ====================
consultantProfileSchema.virtual('profileStrength').get(function() {
  return this.metadata.profileCompleteness.percentage || 0;
});

consultantProfileSchema.virtual('isVerified').get(function() {
  const v = this.metadata.verification;
  return v.educationVerified && v.employmentVerified && v.certificationsVerified;
});

consultantProfileSchema.virtual('totalExperience').get(function() {
  if (!this.careerHistory || this.careerHistory.length === 0) return 0;
  
  const months = this.careerHistory.reduce((total, job) => {
    return total + (job.duration.totalMonths || 0);
  }, 0);
  
  return Math.round(months / 12 * 10) / 10; // Years with one decimal
});

// ==================== Pre-save Middleware ====================
consultantProfileSchema.pre('save', async function(next) {
  try {
    // Generate profile ID if not provided
    if (!this.profileId && this.isNew) {
      this.profileId = await this.constructor.generateProfileId();
    }

    // Update search tokens
    this.updateSearchTokens();

    // Calculate profile completeness
    this.calculateProfileCompleteness();

    // Update career analytics
    if (this.isModified('careerHistory')) {
      this.updateCareerAnalytics();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
consultantProfileSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add headline tokens
  if (this.summary?.headline) {
    this.summary.headline.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  // Add domain expertise
  if (this.expertise?.domains) {
    this.expertise.domains.forEach(d => {
      d.domain.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    });
  }
  
  // Add industry expertise
  if (this.expertise?.industries) {
    this.expertise.industries.forEach(i => {
      i.industry.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    });
  }
  
  // Add skills
  if (this.skillsMatrix?.technical) {
    this.skillsMatrix.technical.forEach(cat => {
      cat.skills.forEach(skill => {
        skill.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
      });
    });
  }
  
  this.searchTokens = Array.from(tokens);
};

consultantProfileSchema.methods.calculateProfileCompleteness = function() {
  const sections = [
    { field: 'summary.executiveSummary', weight: 10 },
    { field: 'careerHistory', weight: 20, minItems: 1 },
    { field: 'expertise.domains', weight: 15, minItems: 2 },
    { field: 'qualifications.academic', weight: 10, minItems: 1 },
    { field: 'qualifications.professional', weight: 10, minItems: 1 },
    { field: 'skillsMatrix.technical', weight: 15, minItems: 3 },
    { field: 'portfolio.projects', weight: 10, minItems: 2 },
    { field: 'development.currentPlan', weight: 5 },
    { field: 'performance.ratings', weight: 5, minItems: 1 }
  ];
  
  let completeness = 0;
  const missingFields = [];
  
  sections.forEach(section => {
    const value = this.get(section.field);
    if (value) {
      if (section.minItems) {
        if (Array.isArray(value) && value.length >= section.minItems) {
          completeness += section.weight;
        } else {
          missingFields.push(section.field);
        }
      } else {
        completeness += section.weight;
      }
    } else {
      missingFields.push(section.field);
    }
  });
  
  this.metadata.profileCompleteness = {
    percentage: Math.min(100, completeness),
    missingFields,
    lastReviewDate: new Date(),
    nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
  };
};

consultantProfileSchema.methods.updateCareerAnalytics = function() {
  if (!this.careerHistory || this.careerHistory.length === 0) return;
  
  // Calculate total months of experience
  const totalMonths = this.careerHistory.reduce((sum, job) => {
    if (job.duration.startDate) {
      const end = job.duration.endDate || new Date();
      const months = Math.floor((end - job.duration.startDate) / (1000 * 60 * 60 * 24 * 30));
      job.duration.totalMonths = months;
      return sum + months;
    }
    return sum;
  }, 0);
  
  // Track promotions
  const promotions = [];
  for (let i = 1; i < this.careerHistory.length; i++) {
    const current = this.careerHistory[i];
    const previous = this.careerHistory[i - 1];
    
    if (current.company.name === previous.company.name &&
        this.isPromotion(previous.position.level, current.position.level)) {
      promotions.push({
        from: previous.position.title,
        to: current.position.title,
        date: current.duration.startDate,
        timeInRole: previous.duration.totalMonths
      });
    }
  }
  
  // Update analytics
  if (!this.analytics) this.analytics = {};
  if (!this.analytics.careerProgression) this.analytics.careerProgression = {};
  
  this.analytics.careerProgression.promotions = promotions;
  
  // Calculate average time per level
  const levelDurations = {};
  this.careerHistory.forEach(job => {
    const level = job.position.level;
    if (!levelDurations[level]) levelDurations[level] = [];
    levelDurations[level].push(job.duration.totalMonths || 0);
  });
  
  const avgTimes = Object.entries(levelDurations).map(([level, durations]) => {
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  });
  
  this.analytics.careerProgression.averageTimePerLevel = 
    avgTimes.reduce((a, b) => a + b, 0) / avgTimes.length;
};

consultantProfileSchema.methods.isPromotion = function(fromLevel, toLevel) {
  const levels = ['entry', 'junior', 'mid', 'senior', 'lead', 'manager', 'director', 'executive'];
  const fromIndex = levels.indexOf(fromLevel);
  const toIndex = levels.indexOf(toLevel);
  return toIndex > fromIndex;
};

consultantProfileSchema.methods.addPortfolioProject = async function(projectData) {
  const project = {
    projectId: mongoose.Types.ObjectId().toString(),
    title: projectData.title,
    client: projectData.client,
    period: projectData.period,
    role: projectData.role,
    scope: projectData.scope,
    approach: projectData.approach,
    outcomes: projectData.outcomes,
    artifacts: projectData.artifacts || [],
    skills: projectData.skills || [],
    keywords: projectData.keywords || [],
    showcase: {
      featured: projectData.featured || false,
      order: projectData.order || 999,
      thumbnail: projectData.thumbnail,
      summary: projectData.summary
    }
  };
  
  if (!this.portfolio) this.portfolio = {};
  if (!this.portfolio.projects) this.portfolio.projects = [];
  
  this.portfolio.projects.push(project);
  
  // Sort by showcase order
  this.portfolio.projects.sort((a, b) => {
    return (a.showcase?.order || 999) - (b.showcase?.order || 999);
  });
  
  await this.save();
  return project;
};

// ==================== Static Methods ====================
consultantProfileSchema.statics.generateProfileId = async function() {
  const prefix = 'PRF';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;
  
  while (exists) {
    let random = '';
    for (let i = 0; i < 8; i++) {
      random += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    code = `${prefix}-${random}`;
    
    const existing = await this.findOne({ profileId: code });
    exists = !!existing;
  }
  
  return code;
};

consultantProfileSchema.statics.searchProfiles = async function(tenantId, criteria = {}) {
  const {
    skills = [],
    industries = [],
    minExperience,
    maxRate,
    availability,
    certifications = [],
    languages = [],
    limit = 20
  } = criteria;
  
  const query = {
    tenantId,
    isDeleted: false
  };
  
  if (skills.length > 0) {
    query['skillsMatrix.technical.skills.name'] = { $in: skills };
  }
  
  if (industries.length > 0) {
    query['expertise.industries.industry'] = { $in: industries };
  }
  
  if (minExperience) {
    query['analytics.careerProgression.totalMonths'] = { $gte: minExperience * 12 };
  }
  
  if (maxRate) {
    query['marketProfile.marketValue.currentRate.amount'] = { $lte: maxRate };
  }
  
  if (availability) {
    query['marketProfile.availability.currentStatus'] = availability;
  }
  
  if (certifications.length > 0) {
    query['qualifications.professional.certification.name'] = { $in: certifications };
  }
  
  if (languages.length > 0) {
    query['skillsMatrix.languages.language'] = { $in: languages };
  }
  
  return await this.find(query)
    .populate('consultantId', 'personalInfo.firstName personalInfo.lastName contact.email')
    .limit(limit)
    .sort({ 'metadata.profileCompleteness.percentage': -1 });
};

// ==================== Create Model ====================
const ConsultantProfileModel = BaseModel.createModel('ConsultantProfile', consultantProfileSchema, {
  collection: 'consultant_profiles',
  enableTimestamps: true,
  enableAudit: true,
  enableSoftDelete: true
});

module.exports = ConsultantProfileModel;