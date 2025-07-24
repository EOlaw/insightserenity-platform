'use strict';

/**
 * @fileoverview Extended user profile model for comprehensive professional and personal information
 * @module shared/lib/database/models/users/user-profile-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const validators = require('../../../utils/validators/common-validators');

/**
 * User profile schema definition
 */
const userProfileSchemaDefinition = {
  // ==================== User Reference ====================
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  // ==================== Personal Information ====================
  personal: {
    fullName: {
      type: String,
      required: true,
      index: true
    },
    headline: {
      type: String,
      maxlength: 200
    },
    summary: {
      type: String,
      maxlength: 2000
    },
    about: {
      type: String,
      maxlength: 5000
    },
    
    // Contact information
    contact: {
      emails: [{
        type: {
          type: String,
          enum: ['personal', 'work', 'other']
        },
        email: {
          type: String,
          validate: {
            validator: validators.isEmail,
            message: 'Invalid email address'
          }
        },
        isPublic: {
          type: Boolean,
          default: false
        }
      }],
      phones: [{
        type: {
          type: String,
          enum: ['mobile', 'work', 'home', 'other']
        },
        number: String,
        extension: String,
        isPublic: {
          type: Boolean,
          default: false
        }
      }],
      websites: [{
        type: {
          type: String,
          enum: ['personal', 'portfolio', 'blog', 'company', 'other']
        },
        url: {
          type: String,
          validate: {
            validator: validators.isURL,
            message: 'Invalid URL'
          }
        },
        title: String
      }]
    },

    // Address information
    addresses: [{
      type: {
        type: String,
        enum: ['home', 'work', 'billing', 'shipping', 'other'],
        default: 'home'
      },
      line1: String,
      line2: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
      coordinates: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: {
          type: [Number],
          default: undefined
        }
      },
      isPrimary: {
        type: Boolean,
        default: false
      },
      isPublic: {
        type: Boolean,
        default: false
      }
    }],

    // Demographics
    demographics: {
      dateOfBirth: Date,
      gender: {
        type: String,
        enum: ['male', 'female', 'other', 'prefer_not_to_say']
      },
      ethnicity: String,
      nationality: String,
      languages: [{
        language: String,
        proficiency: {
          type: String,
          enum: ['native', 'fluent', 'professional', 'conversational', 'basic']
        }
      }],
      maritalStatus: {
        type: String,
        enum: ['single', 'married', 'divorced', 'widowed', 'prefer_not_to_say']
      }
    }
  },

  // ==================== Professional Information ====================
  professional: {
    currentTitle: String,
    currentCompany: String,
    yearsOfExperience: Number,
    industryExperience: [String],
    
    // Work history
    workHistory: [{
      company: {
        name: {
          type: String,
          required: true
        },
        logo: String,
        website: String,
        industry: String,
        size: {
          type: String,
          enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001+']
        }
      },
      title: {
        type: String,
        required: true
      },
      department: String,
      location: {
        city: String,
        state: String,
        country: String,
        remote: Boolean
      },
      startDate: {
        type: Date,
        required: true
      },
      endDate: Date,
      isCurrent: {
        type: Boolean,
        default: false
      },
      description: String,
      achievements: [String],
      technologies: [String],
      references: [{
        name: String,
        title: String,
        relationship: String,
        email: String,
        phone: String
      }]
    }],

    // Skills and expertise
    skills: {
      technical: [{
        name: {
          type: String,
          required: true
        },
        category: String,
        level: {
          type: String,
          enum: ['beginner', 'intermediate', 'advanced', 'expert']
        },
        yearsOfExperience: Number,
        endorsements: [{
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          },
          endorsedAt: Date
        }],
        verified: Boolean,
        verifiedBy: String
      }],
      soft: [{
        name: String,
        category: String,
        description: String
      }],
      tools: [{
        name: String,
        category: String,
        proficiency: {
          type: String,
          enum: ['basic', 'intermediate', 'advanced', 'expert']
        }
      }]
    },

    // Certifications and licenses
    certifications: [{
      name: {
        type: String,
        required: true
      },
      issuer: {
        type: String,
        required: true
      },
      credentialId: String,
      credentialUrl: String,
      issueDate: {
        type: Date,
        required: true
      },
      expirationDate: Date,
      isActive: {
        type: Boolean,
        default: true
      },
      skills: [String],
      attachments: [{
        type: String,
        url: String,
        uploadedAt: Date
      }]
    }],

    // Professional memberships
    memberships: [{
      organization: String,
      position: String,
      startDate: Date,
      endDate: Date,
      isCurrent: Boolean,
      description: String
    }],

    // Publications and patents
    publications: [{
      title: String,
      type: {
        type: String,
        enum: ['article', 'book', 'whitepaper', 'research', 'blog', 'other']
      },
      publisher: String,
      publicationDate: Date,
      url: String,
      doi: String,
      coAuthors: [String],
      description: String
    }],

    patents: [{
      title: String,
      patentNumber: String,
      filingDate: Date,
      issueDate: Date,
      status: {
        type: String,
        enum: ['pending', 'granted', 'expired', 'abandoned']
      },
      inventors: [String],
      description: String,
      url: String
    }]
  },

  // ==================== Education ====================
  education: [{
    institution: {
      name: {
        type: String,
        required: true
      },
      logo: String,
      website: String,
      type: {
        type: String,
        enum: ['university', 'college', 'bootcamp', 'online', 'certification', 'other']
      }
    },
    degree: String,
    fieldOfStudy: String,
    startDate: Date,
    endDate: Date,
    isCompleted: {
      type: Boolean,
      default: true
    },
    grade: String,
    activities: [String],
    achievements: [String],
    thesis: {
      title: String,
      advisor: String,
      abstract: String,
      url: String
    }
  }],

  // ==================== Portfolio & Showcase ====================
  portfolio: {
    projects: [{
      title: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ['personal', 'professional', 'academic', 'opensource', 'freelance']
      },
      description: String,
      role: String,
      teamSize: Number,
      startDate: Date,
      endDate: Date,
      status: {
        type: String,
        enum: ['planning', 'in_progress', 'completed', 'on_hold', 'cancelled']
      },
      url: String,
      repository: String,
      technologies: [String],
      outcomes: [String],
      media: [{
        type: {
          type: String,
          enum: ['image', 'video', 'document', 'link']
        },
        url: String,
        thumbnail: String,
        caption: String
      }],
      visibility: {
        type: String,
        enum: ['public', 'private', 'organization', 'connections'],
        default: 'public'
      }
    }],

    achievements: [{
      title: String,
      type: {
        type: String,
        enum: ['award', 'recognition', 'milestone', 'contribution', 'other']
      },
      issuer: String,
      date: Date,
      description: String,
      url: String,
      media: String
    }],

    media: {
      photos: [{
        url: String,
        thumbnail: String,
        caption: String,
        tags: [String],
        uploadedAt: Date,
        visibility: {
          type: String,
          enum: ['public', 'private', 'connections'],
          default: 'public'
        }
      }],
      videos: [{
        url: String,
        thumbnail: String,
        title: String,
        description: String,
        duration: Number,
        uploadedAt: Date,
        visibility: {
          type: String,
          enum: ['public', 'private', 'connections'],
          default: 'public'
        }
      }],
      documents: [{
        title: String,
        type: String,
        url: String,
        size: Number,
        uploadedAt: Date,
        visibility: {
          type: String,
          enum: ['public', 'private', 'connections'],
          default: 'private'
        }
      }]
    }
  },

  // ==================== Social & Professional Networks ====================
  social: {
    profiles: [{
      platform: {
        type: String,
        enum: ['linkedin', 'twitter', 'github', 'gitlab', 'stackoverflow', 'behance', 'dribbble', 'medium', 'devto', 'youtube', 'instagram', 'facebook', 'other']
      },
      url: String,
      username: String,
      verified: Boolean,
      visibility: {
        type: String,
        enum: ['public', 'connections', 'private'],
        default: 'public'
      }
    }],

    connections: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      type: {
        type: String,
        enum: ['colleague', 'mentor', 'mentee', 'friend', 'following', 'follower']
      },
      connectedAt: Date,
      endorsements: [String],
      notes: String
    }],

    recommendations: [{
      fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      relationship: String,
      duration: String,
      content: {
        type: String,
        required: true,
        maxlength: 2000
      },
      skills: [String],
      givenAt: Date,
      isVisible: {
        type: Boolean,
        default: true
      }
    }]
  },

  // ==================== Preferences & Settings ====================
  preferences: {
    visibility: {
      profile: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'organization'
      },
      email: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'private'
      },
      phone: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'private'
      },
      location: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'organization'
      },
      workHistory: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'public'
      },
      education: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'public'
      }
    },

    openTo: {
      opportunities: {
        type: Boolean,
        default: false
      },
      types: [{
        type: String,
        enum: ['full_time', 'part_time', 'contract', 'freelance', 'internship', 'volunteer', 'advisory', 'speaking', 'mentoring']
      }],
      remoteOnly: Boolean,
      locations: [String],
      industries: [String],
      minSalary: Number,
      currency: String
    },

    communication: {
      preferredContact: {
        type: String,
        enum: ['email', 'phone', 'in_app', 'linkedin'],
        default: 'email'
      },
      availableHours: {
        timezone: String,
        days: [{
          type: String,
          enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        }],
        startTime: String,
        endTime: String
      },
      responseTime: {
        type: String,
        enum: ['immediate', 'within_hours', 'within_day', 'within_week'],
        default: 'within_day'
      }
    }
  },

  // ==================== Custom Fields ====================
  customFields: {
    organizationFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    userFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Analytics & Insights ====================
  analytics: {
    profileViews: {
      total: {
        type: Number,
        default: 0
      },
      lastWeek: {
        type: Number,
        default: 0
      },
      lastMonth: {
        type: Number,
        default: 0
      },
      viewers: [{
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        viewedAt: Date,
        source: String
      }]
    },

    searchAppearances: {
      total: {
        type: Number,
        default: 0
      },
      keywords: [{
        term: String,
        count: Number
      }]
    },

    engagement: {
      endorsementsReceived: {
        type: Number,
        default: 0
      },
      recommendationsReceived: {
        type: Number,
        default: 0
      },
      connectionsCount: {
        type: Number,
        default: 0
      },
      followersCount: {
        type: Number,
        default: 0
      }
    },

    completeness: {
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      missingFields: [String],
      lastCalculated: Date
    }
  },

  // ==================== Metadata ====================
  metadata: {
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    importedFrom: {
      type: String,
      enum: ['manual', 'linkedin', 'resume', 'api', 'migration']
    },
    tags: [String],
    version: {
      type: Number,
      default: 1
    },
    isPublished: {
      type: Boolean,
      default: true
    },
    publishedAt: Date
  }
};

// Create schema
const userProfileSchema = BaseModel.createSchema(userProfileSchemaDefinition, {
  collection: 'user_profiles',
  timestamps: true
});

// ==================== Indexes ====================
userProfileSchema.index({ userId: 1 });
userProfileSchema.index({ organizationId: 1, 'metadata.isPublished': 1 });
userProfileSchema.index({ 'personal.fullName': 'text', 'professional.currentTitle': 'text', 'professional.skills.technical.name': 'text' });
userProfileSchema.index({ 'professional.workHistory.company.name': 1 });
userProfileSchema.index({ 'preferences.openTo.opportunities': 1 });
userProfileSchema.index({ 'analytics.completeness.score': -1 });
userProfileSchema.index({ 'metadata.tags': 1 });

// ==================== Virtual Fields ====================
userProfileSchema.virtual('profileUrl').get(function() {
  return `/profiles/${this.userId}`;
});

userProfileSchema.virtual('isComplete').get(function() {
  return this.analytics.completeness.score >= 80;
});

userProfileSchema.virtual('currentPosition').get(function() {
  return this.professional.workHistory.find(job => job.isCurrent);
});

userProfileSchema.virtual('totalExperience').get(function() {
  if (!this.professional.workHistory || this.professional.workHistory.length === 0) {
    return 0;
  }

  let totalMonths = 0;
  this.professional.workHistory.forEach(job => {
    const startDate = new Date(job.startDate);
    const endDate = job.endDate ? new Date(job.endDate) : new Date();
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                  (endDate.getMonth() - startDate.getMonth());
    totalMonths += months;
  });

  return Math.round(totalMonths / 12 * 10) / 10; // Years with one decimal
});

// ==================== Pre-save Middleware ====================
userProfileSchema.pre('save', async function(next) {
  try {
    // Update full name
    if (this.isModified('personal')) {
      const User = this.model('User');
      const user = await User.findById(this.userId);
      if (user) {
        this.personal.fullName = user.fullName;
      }
    }

    // Calculate profile completeness
    if (this.isModified()) {
      this.calculateCompleteness();
    }

    // Update analytics
    if (this.isNew) {
      this.metadata.publishedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
userProfileSchema.methods.calculateCompleteness = function() {
  const weights = {
    personal: 20,
    professional: 30,
    education: 15,
    skills: 15,
    portfolio: 10,
    social: 10
  };

  let score = 0;
  const missing = [];

  // Personal information
  if (this.personal.headline) score += 5;
  else missing.push('headline');
  
  if (this.personal.summary) score += 5;
  else missing.push('summary');
  
  if (this.personal.contact.emails.length > 0) score += 5;
  else missing.push('contact_email');
  
  if (this.personal.addresses.length > 0) score += 5;
  else missing.push('address');

  // Professional information
  if (this.professional.workHistory.length > 0) score += 15;
  else missing.push('work_history');
  
  if (this.professional.skills.technical.length > 0) score += 10;
  else missing.push('technical_skills');
  
  if (this.professional.currentTitle) score += 5;
  else missing.push('current_title');

  // Education
  if (this.education.length > 0) score += 15;
  else missing.push('education');

  // Skills
  if (this.professional.skills.technical.length >= 5) score += 10;
  else missing.push('more_skills');
  
  if (this.professional.certifications.length > 0) score += 5;
  else missing.push('certifications');

  // Portfolio
  if (this.portfolio.projects.length > 0) score += 5;
  else missing.push('projects');
  
  if (this.portfolio.achievements.length > 0) score += 5;
  else missing.push('achievements');

  // Social
  if (this.social.profiles.length > 0) score += 5;
  else missing.push('social_profiles');
  
  if (this.social.recommendations.length > 0) score += 5;
  else missing.push('recommendations');

  this.analytics.completeness = {
    score: Math.min(score, 100),
    missingFields: missing,
    lastCalculated: new Date()
  };

  return this.analytics.completeness;
};

userProfileSchema.methods.addWorkExperience = async function(workData) {
  // Check for overlapping current positions
  if (workData.isCurrent) {
    this.professional.workHistory.forEach(job => {
      if (job.isCurrent) {
        job.isCurrent = false;
        job.endDate = new Date();
      }
    });
  }

  this.professional.workHistory.push(workData);
  
  // Update current title and company
  if (workData.isCurrent) {
    this.professional.currentTitle = workData.title;
    this.professional.currentCompany = workData.company.name;
  }

  // Recalculate years of experience
  this.professional.yearsOfExperience = this.totalExperience;

  await this.save();
  return this.professional.workHistory[this.professional.workHistory.length - 1];
};

userProfileSchema.methods.addSkill = async function(skillData) {
  const { name, category, level } = skillData;

  // Check if skill already exists
  const existingSkill = this.professional.skills.technical.find(
    skill => skill.name.toLowerCase() === name.toLowerCase()
  );

  if (existingSkill) {
    // Update existing skill
    if (level) existingSkill.level = level;
    if (category) existingSkill.category = category;
  } else {
    // Add new skill
    this.professional.skills.technical.push(skillData);
  }

  await this.save();
  return existingSkill || this.professional.skills.technical[this.professional.skills.technical.length - 1];
};

userProfileSchema.methods.endorseSkill = async function(skillName, endorserId) {
  const skill = this.professional.skills.technical.find(
    s => s.name.toLowerCase() === skillName.toLowerCase()
  );

  if (!skill) {
    throw new AppError('Skill not found', 404, 'SKILL_NOT_FOUND');
  }

  // Check if already endorsed
  const alreadyEndorsed = skill.endorsements.some(
    e => e.userId.toString() === endorserId.toString()
  );

  if (alreadyEndorsed) {
    throw new AppError('Already endorsed this skill', 409, 'ALREADY_ENDORSED');
  }

  skill.endorsements.push({
    userId: endorserId,
    endorsedAt: new Date()
  });

  this.analytics.engagement.endorsementsReceived += 1;

  await this.save();
  return skill;
};

userProfileSchema.methods.addRecommendation = async function(recommendationData) {
  this.social.recommendations.push({
    ...recommendationData,
    givenAt: new Date(),
    isVisible: true
  });

  this.analytics.engagement.recommendationsReceived += 1;

  await this.save();
  return this.social.recommendations[this.social.recommendations.length - 1];
};

userProfileSchema.methods.addConnection = async function(connectionData) {
  const { userId, type } = connectionData;

  // Check if already connected
  const existing = this.social.connections.find(
    c => c.userId.toString() === userId.toString()
  );

  if (existing) {
    // Update connection type if needed
    existing.type = type;
  } else {
    this.social.connections.push({
      userId,
      type,
      connectedAt: new Date()
    });

    this.analytics.engagement.connectionsCount += 1;
  }

  await this.save();
  return existing || this.social.connections[this.social.connections.length - 1];
};

userProfileSchema.methods.recordProfileView = async function(viewerId, source = 'direct') {
  // Don't record self-views
  if (viewerId && viewerId.toString() === this.userId.toString()) {
    return;
  }

  this.analytics.profileViews.total += 1;
  this.analytics.profileViews.lastMonth += 1;
  this.analytics.profileViews.lastWeek += 1;

  if (viewerId) {
    // Keep only last 100 viewers
    if (this.analytics.profileViews.viewers.length >= 100) {
      this.analytics.profileViews.viewers.shift();
    }

    this.analytics.profileViews.viewers.push({
      userId: viewerId,
      viewedAt: new Date(),
      source
    });
  }

  await this.save();
};

userProfileSchema.methods.updateVisibility = async function(settings) {
  Object.assign(this.preferences.visibility, settings);
  await this.save();
  return this.preferences.visibility;
};

userProfileSchema.methods.exportProfile = function(format = 'json') {
  const profileData = this.toObject();

  // Remove sensitive information
  delete profileData._id;
  delete profileData.__v;
  delete profileData.analytics.profileViews.viewers;
  delete profileData.social.connections;

  if (format === 'resume') {
    // Format for resume export
    return {
      personal: {
        name: profileData.personal.fullName,
        headline: profileData.personal.headline,
        summary: profileData.personal.summary,
        email: profileData.personal.contact.emails.find(e => e.type === 'personal')?.email,
        phone: profileData.personal.contact.phones.find(p => p.type === 'mobile')?.number,
        location: profileData.personal.addresses.find(a => a.isPrimary)?.city
      },
      experience: profileData.professional.workHistory.map(job => ({
        company: job.company.name,
        title: job.title,
        duration: `${job.startDate} - ${job.endDate || 'Present'}`,
        description: job.description,
        achievements: job.achievements
      })),
      education: profileData.education.map(edu => ({
        institution: edu.institution.name,
        degree: edu.degree,
        field: edu.fieldOfStudy,
        graduation: edu.endDate
      })),
      skills: profileData.professional.skills.technical.map(s => s.name),
      certifications: profileData.professional.certifications.map(c => ({
        name: c.name,
        issuer: c.issuer,
        date: c.issueDate
      }))
    };
  }

  return profileData;
};

// ==================== Static Methods ====================
userProfileSchema.statics.createProfile = async function(userId, profileData = {}) {
  // Check if profile already exists
  const existing = await this.findOne({ userId });
  if (existing) {
    throw new AppError('Profile already exists', 409, 'PROFILE_EXISTS');
  }

  // Get user data
  const User = this.model('User');
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const profile = new this({
    userId,
    organizationId: user.defaultOrganizationId,
    personal: {
      fullName: user.fullName,
      ...profileData.personal
    },
    ...profileData
  });

  await profile.save();

  logger.info('User profile created', {
    profileId: profile._id,
    userId
  });

  return profile;
};

userProfileSchema.statics.findByUserId = async function(userId, options = {}) {
  const query = { userId };
  
  if (options.published) {
    query['metadata.isPublished'] = true;
  }

  const profile = await this.findOne(query);
  
  if (!profile && options.createIfNotExists) {
    return await this.createProfile(userId);
  }

  return profile;
};

userProfileSchema.statics.searchProfiles = async function(searchQuery, options = {}) {
  const {
    organizationId,
    skills,
    location,
    openToOpportunities,
    minExperience,
    limit = 20,
    skip = 0,
    sort = { 'analytics.completeness.score': -1 }
  } = options;

  const query = {
    'metadata.isPublished': true
  };

  if (searchQuery) {
    query.$text = { $search: searchQuery };
  }

  if (organizationId) {
    query.organizationId = organizationId;
  }

  if (skills && skills.length > 0) {
    query['professional.skills.technical.name'] = { $in: skills };
  }

  if (location) {
    query.$or = [
      { 'personal.addresses.city': new RegExp(location, 'i') },
      { 'personal.addresses.state': new RegExp(location, 'i') },
      { 'personal.addresses.country': new RegExp(location, 'i') }
    ];
  }

  if (openToOpportunities) {
    query['preferences.openTo.opportunities'] = true;
  }

  if (minExperience) {
    query['professional.yearsOfExperience'] = { $gte: minExperience };
  }

  const [profiles, total] = await Promise.all([
    this.find(query)
      .populate('userId', 'email profile.firstName profile.lastName profile.avatar')
      .limit(limit)
      .skip(skip)
      .sort(sort),
    this.countDocuments(query)
  ]);

  return {
    profiles,
    total,
    hasMore: total > skip + profiles.length
  };
};

userProfileSchema.statics.getSkillsAnalytics = async function(organizationId) {
  const match = organizationId 
    ? { organizationId, 'metadata.isPublished': true }
    : { 'metadata.isPublished': true };

  const analytics = await this.aggregate([
    { $match: match },
    { $unwind: '$professional.skills.technical' },
    {
      $group: {
        _id: {
          name: '$professional.skills.technical.name',
          category: '$professional.skills.technical.category'
        },
        count: { $sum: 1 },
        avgLevel: {
          $avg: {
            $switch: {
              branches: [
                { case: { $eq: ['$professional.skills.technical.level', 'beginner'] }, then: 1 },
                { case: { $eq: ['$professional.skills.technical.level', 'intermediate'] }, then: 2 },
                { case: { $eq: ['$professional.skills.technical.level', 'advanced'] }, then: 3 },
                { case: { $eq: ['$professional.skills.technical.level', 'expert'] }, then: 4 }
              ],
              default: 0
            }
          }
        },
        totalEndorsements: { $sum: { $size: '$professional.skills.technical.endorsements' } }
      }
    },
    {
      $project: {
        _id: 0,
        skill: '$_id.name',
        category: '$_id.category',
        userCount: '$count',
        avgProficiency: { $round: ['$avgLevel', 1] },
        totalEndorsements: 1
      }
    },
    { $sort: { userCount: -1 } },
    { $limit: 50 }
  ]);

  return analytics;
};

userProfileSchema.statics.getTalentInsights = async function(organizationId) {
  const match = organizationId 
    ? { organizationId, 'metadata.isPublished': true }
    : { 'metadata.isPublished': true };

  const insights = await this.aggregate([
    { $match: match },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              totalProfiles: { $sum: 1 },
              avgExperience: { $avg: '$professional.yearsOfExperience' },
              avgCompleteness: { $avg: '$analytics.completeness.score' },
              openToOpportunities: {
                $sum: { $cond: ['$preferences.openTo.opportunities', 1, 0] }
              }
            }
          }
        ],
        topSkills: [
          { $unwind: '$professional.skills.technical' },
          {
            $group: {
              _id: '$professional.skills.technical.name',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        experienceDistribution: [
          {
            $bucket: {
              groupBy: '$professional.yearsOfExperience',
              boundaries: [0, 2, 5, 10, 15, 20, 100],
              default: 'Other',
              output: {
                count: { $sum: 1 }
              }
            }
          }
        ],
        topCompanies: [
          { $unwind: '$professional.workHistory' },
          {
            $group: {
              _id: '$professional.workHistory.company.name',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        educationLevels: [
          { $unwind: '$education' },
          {
            $group: {
              _id: '$education.degree',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ]
      }
    }
  ]);

  return insights[0];
};

userProfileSchema.statics.bulkImportFromLinkedIn = async function(linkedInData, userId) {
  try {
    const profileData = {
      personal: {
        headline: linkedInData.headline,
        summary: linkedInData.summary,
        contact: {
          emails: linkedInData.emails?.map(email => ({
            type: 'personal',
            email: email.email,
            isPublic: false
          })) || []
        },
        addresses: linkedInData.location ? [{
          type: 'home',
          city: linkedInData.location.city,
          state: linkedInData.location.state,
          country: linkedInData.location.country,
          isPublic: true
        }] : []
      },
      professional: {
        currentTitle: linkedInData.currentPosition?.title,
        currentCompany: linkedInData.currentPosition?.company,
        workHistory: linkedInData.positions?.map(pos => ({
          company: {
            name: pos.company,
            industry: pos.industry
          },
          title: pos.title,
          location: {
            city: pos.location
          },
          startDate: new Date(pos.startDate),
          endDate: pos.endDate ? new Date(pos.endDate) : null,
          isCurrent: pos.isCurrent,
          description: pos.description
        })) || [],
        skills: {
          technical: linkedInData.skills?.map(skill => ({
            name: skill.name,
            endorsements: []
          })) || []
        }
      },
      education: linkedInData.education?.map(edu => ({
        institution: {
          name: edu.school
        },
        degree: edu.degree,
        fieldOfStudy: edu.fieldOfStudy,
        startDate: edu.startDate ? new Date(edu.startDate) : null,
        endDate: edu.endDate ? new Date(edu.endDate) : null
      })) || [],
      social: {
        profiles: [{
          platform: 'linkedin',
          url: linkedInData.profileUrl,
          username: linkedInData.username,
          verified: true,
          visibility: 'public'
        }]
      },
      metadata: {
        importedFrom: 'linkedin'
      }
    };

    const profile = await this.findByUserId(userId, { createIfNotExists: true });
    
    // Merge with existing data
    Object.assign(profile, profileData);
    
    await profile.save();

    logger.info('LinkedIn profile imported', {
      profileId: profile._id,
      userId
    });

    return profile;
  } catch (error) {
    logger.error('LinkedIn import failed', {
      userId,
      error: error.message
    });
    throw error;
  }
};

// Create and export model
const UserProfileModel = BaseModel.createModel('UserProfile', userProfileSchema);

module.exports = {
  schema: userProfileSchema,
  model: UserProfileModel
};