'use strict';

/**
 * @fileoverview Organization member model for managing members and their roles
 * @module shared/lib/database/models/organizations/organization-member-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const validators = require('../../../utils/validators/common-validators');

/**
 * Organization member schema definition
 */
const organizationMemberSchemaDefinition = {
  // ==================== Core Relationships ====================
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },

  // ==================== Member Details ====================
  profile: {
    displayName: String,
    title: String,
    department: String,
    employeeId: String,
    joinDate: {
      type: Date,
      default: Date.now
    },
    bio: {
      type: String,
      maxlength: 500
    },
    avatar: {
      url: String,
      publicId: String
    },
    contactInfo: {
      workEmail: String,
      workPhone: String,
      extension: String,
      mobilePhone: String,
      preferredContact: {
        type: String,
        enum: ['email', 'phone', 'slack', 'teams', 'other'],
        default: 'email'
      }
    },
    location: {
      office: String,
      desk: String,
      building: String,
      floor: String,
      remoteLocation: String,
      timezone: String
    },
    workSchedule: {
      type: {
        type: String,
        enum: ['full-time', 'part-time', 'contractor', 'intern', 'consultant'],
        default: 'full-time'
      },
      hoursPerWeek: Number,
      workDays: [String],
      startTime: String,
      endTime: String
    }
  },

  // ==================== Roles & Permissions ====================
  roles: [{
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true
    },
    roleName: {
      type: String,
      required: true
    },
    scope: {
      type: String,
      enum: ['organization', 'department', 'team', 'project'],
      default: 'organization'
    },
    scopeId: mongoose.Schema.Types.ObjectId,
    isPrimary: {
      type: Boolean,
      default: false
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    expiresAt: Date,
    conditions: mongoose.Schema.Types.Mixed
  }],

  permissions: {
    direct: [{
      permissionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission'
      },
      resource: String,
      actions: [String],
      granted: {
        type: Boolean,
        default: true
      },
      conditions: mongoose.Schema.Types.Mixed,
      grantedAt: Date,
      grantedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      expiresAt: Date,
      reason: String
    }],
    inherited: [{
      source: {
        type: String,
        enum: ['role', 'department', 'team', 'organization']
      },
      sourceId: mongoose.Schema.Types.ObjectId,
      permissions: [String]
    }],
    restrictions: [{
      resource: String,
      actions: [String],
      reason: String,
      restrictedAt: Date,
      restrictedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      expiresAt: Date
    }]
  },

  // ==================== Department & Team Assignments ====================
  assignments: {
    departments: [{
      departmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
      },
      name: String,
      role: String,
      isPrimary: Boolean,
      joinedAt: Date,
      manager: {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        name: String
      }
    }],
    teams: [{
      teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team'
      },
      name: String,
      role: String,
      isLead: Boolean,
      joinedAt: Date,
      responsibilities: [String]
    }],
    projects: [{
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      name: String,
      role: String,
      allocation: Number, // Percentage
      startDate: Date,
      endDate: Date,
      status: {
        type: String,
        enum: ['active', 'completed', 'on-hold', 'cancelled'],
        default: 'active'
      }
    }]
  },

  // ==================== Access & Security ====================
  access: {
    level: {
      type: String,
      enum: ['basic', 'standard', 'elevated', 'admin', 'super-admin'],
      default: 'standard',
      index: true
    },
    areas: [{
      areaName: String,
      accessLevel: String,
      grantedAt: Date
    }],
    ipRestrictions: {
      enabled: Boolean,
      allowedIps: [String],
      deniedIps: [String]
    },
    timeRestrictions: {
      enabled: Boolean,
      allowedHours: {
        start: String,
        end: String,
        timezone: String
      },
      allowedDays: [Number], // 0-6 (Sunday-Saturday)
      blockedDates: [Date]
    },
    deviceRestrictions: {
      enabled: Boolean,
      allowedDevices: [{
        deviceId: String,
        deviceName: String,
        deviceType: String,
        addedAt: Date
      }],
      requireDeviceApproval: Boolean
    },
    dataAccess: {
      level: {
        type: String,
        enum: ['none', 'own', 'team', 'department', 'organization', 'all'],
        default: 'team'
      },
      exceptions: [{
        resource: String,
        level: String,
        reason: String
      }]
    }
  },

  // ==================== Status & Activity ====================
  status: {
    state: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'pending', 'offboarding', 'offboarded'],
      default: 'pending',
      index: true
    },
    reason: String,
    lastActiveAt: Date,
    suspendedAt: Date,
    suspendedUntil: Date,
    offboardingStarted: Date,
    offboardingCompleted: Date,
    reactivatedAt: Date,
    history: [{
      previousState: String,
      newState: String,
      changedAt: Date,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: String
    }]
  },

  activity: {
    lastLoginAt: Date,
    lastActivityAt: Date,
    loginCount: {
      type: Number,
      default: 0
    },
    totalActions: {
      type: Number,
      default: 0
    },
    averageSessionDuration: Number,
    mostUsedFeatures: [{
      feature: String,
      count: Number,
      lastUsedAt: Date
    }],
    resourcesAccessed: [{
      resourceType: String,
      resourceId: String,
      accessedAt: Date,
      action: String
    }],
    contributions: {
      documentsCreated: { type: Number, default: 0 },
      documentsEdited: { type: Number, default: 0 },
      tasksCompleted: { type: Number, default: 0 },
      commentsAdded: { type: Number, default: 0 },
      meetingsAttended: { type: Number, default: 0 }
    }
  },

  // ==================== Onboarding & Training ====================
  onboarding: {
    status: {
      type: String,
      enum: ['not-started', 'in-progress', 'completed', 'skipped'],
      default: 'not-started'
    },
    startedAt: Date,
    completedAt: Date,
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    checklist: [{
      taskId: String,
      title: String,
      description: String,
      category: String,
      required: Boolean,
      completed: Boolean,
      completedAt: Date,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    assignedBuddy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      name: String,
      assignedAt: Date
    },
    feedback: {
      rating: Number,
      comments: String,
      submittedAt: Date
    }
  },

  training: {
    requiredCourses: [{
      courseId: String,
      title: String,
      status: {
        type: String,
        enum: ['not-started', 'in-progress', 'completed', 'failed'],
        default: 'not-started'
      },
      progress: Number,
      startedAt: Date,
      completedAt: Date,
      score: Number,
      certificateUrl: String,
      expiresAt: Date
    }],
    completedCourses: [{
      courseId: String,
      title: String,
      completedAt: Date,
      score: Number,
      certificateUrl: String
    }],
    skills: [{
      skillName: String,
      level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'expert'],
        default: 'beginner'
      },
      verifiedAt: Date,
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    certifications: [{
      name: String,
      issuer: String,
      issuedAt: Date,
      expiresAt: Date,
      credentialId: String,
      verificationUrl: String
    }]
  },

  // ==================== Performance & Goals ====================
  performance: {
    currentRating: {
      score: Number,
      scale: Number,
      period: String,
      evaluatedAt: Date,
      evaluatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    history: [{
      period: String,
      score: Number,
      scale: Number,
      evaluatedAt: Date,
      evaluatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      feedback: String
    }],
    goals: [{
      goalId: mongoose.Schema.Types.ObjectId,
      title: String,
      description: String,
      type: {
        type: String,
        enum: ['personal', 'team', 'department', 'organization'],
        default: 'personal'
      },
      status: {
        type: String,
        enum: ['draft', 'active', 'completed', 'cancelled'],
        default: 'draft'
      },
      progress: Number,
      targetDate: Date,
      completedAt: Date,
      metrics: [{
        name: String,
        target: Number,
        current: Number,
        unit: String
      }]
    }],
    recognitions: [{
      type: {
        type: String,
        enum: ['achievement', 'milestone', 'peer-recognition', 'manager-recognition', 'award']
      },
      title: String,
      description: String,
      givenBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      givenAt: Date,
      visible: {
        type: Boolean,
        default: true
      }
    }]
  },

  // ==================== Compensation & Benefits ====================
  compensation: {
    type: {
      type: String,
      enum: ['salary', 'hourly', 'contract', 'commission', 'volunteer'],
      select: false
    },
    currency: {
      type: String,
      default: 'USD',
      select: false
    },
    benefits: {
      healthInsurance: { type: Boolean, select: false },
      dentalInsurance: { type: Boolean, select: false },
      visionInsurance: { type: Boolean, select: false },
      lifeInsurance: { type: Boolean, select: false },
      retirement401k: { type: Boolean, select: false },
      paidTimeOff: { type: Boolean, select: false },
      other: [String]
    },
    equity: {
      hasEquity: { type: Boolean, select: false },
      vestingSchedule: { type: String, select: false }
    }
  },

  // ==================== Communication Preferences ====================
  preferences: {
    notifications: {
      email: {
        enabled: { type: Boolean, default: true },
        frequency: {
          type: String,
          enum: ['instant', 'hourly', 'daily', 'weekly'],
          default: 'instant'
        },
        categories: {
          taskAssignments: { type: Boolean, default: true },
          projectUpdates: { type: Boolean, default: true },
          teamAnnouncements: { type: Boolean, default: true },
          organizationNews: { type: Boolean, default: true },
          performanceReviews: { type: Boolean, default: true }
        }
      },
      inApp: {
        enabled: { type: Boolean, default: true },
        desktop: { type: Boolean, default: true },
        mobile: { type: Boolean, default: true }
      },
      slack: {
        enabled: { type: Boolean, default: false },
        userId: String,
        dmEnabled: { type: Boolean, default: true },
        mentionsOnly: { type: Boolean, default: false }
      }
    },
    privacy: {
      showProfile: { type: Boolean, default: true },
      showContactInfo: { type: Boolean, default: true },
      showActivity: { type: Boolean, default: false },
      allowDirectMessages: { type: Boolean, default: true }
    },
    display: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'auto'
      },
      language: {
        type: String,
        default: 'en'
      },
      dateFormat: String,
      timeFormat: String
    }
  },

  // ==================== Emergency Contact ====================
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String,
    alternatePhone: String,
    email: String,
    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    }
  },

  // ==================== Metadata ====================
  metadata: {
    source: {
      type: String,
      enum: ['invitation', 'direct_add', 'import', 'sso', 'api', 'migration'],
      default: 'invitation'
    },
    invitationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationInvitation'
    },
    importBatchId: String,
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    notes: [{
      content: String,
      type: {
        type: String,
        enum: ['general', 'hr', 'performance', 'incident', 'commendation']
      },
      visibility: {
        type: String,
        enum: ['private', 'managers', 'hr', 'all'],
        default: 'managers'
      },
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date
    }],
    flags: {
      isManager: { type: Boolean, default: false },
      isExecutive: { type: Boolean, default: false },
      isContractor: { type: Boolean, default: false },
      isRemote: { type: Boolean, default: false },
      requiresSpecialAccess: { type: Boolean, default: false },
      hasNDA: { type: Boolean, default: false }
    }
  }
};

// Create schema
const organizationMemberSchema = BaseModel.createSchema(organizationMemberSchemaDefinition, {
  collection: 'organization_members',
  timestamps: true
});

// ==================== Indexes ====================
// Unique compound index
organizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

// Query optimization indexes
organizationMemberSchema.index({ organizationId: 1, 'status.state': 1 });
organizationMemberSchema.index({ userId: 1, 'status.state': 1 });
organizationMemberSchema.index({ organizationId: 1, 'roles.roleName': 1 });
organizationMemberSchema.index({ organizationId: 1, 'assignments.departments.departmentId': 1 });
organizationMemberSchema.index({ organizationId: 1, 'assignments.teams.teamId': 1 });
organizationMemberSchema.index({ 'activity.lastActivityAt': -1 });
organizationMemberSchema.index({ 'metadata.tags': 1 });
organizationMemberSchema.index({ createdAt: -1 });

// ==================== Virtual Fields ====================
organizationMemberSchema.virtual('isActive').get(function() {
  return this.status.state === 'active';
});

organizationMemberSchema.virtual('isAdmin').get(function() {
  return this.roles.some(role => 
    ['admin', 'owner', 'super-admin'].includes(role.roleName.toLowerCase())
  );
});

organizationMemberSchema.virtual('primaryRole').get(function() {
  const primary = this.roles.find(r => r.isPrimary);
  return primary || this.roles[0];
});

organizationMemberSchema.virtual('fullName').get(function() {
  return this.profile.displayName || 'Member';
});

organizationMemberSchema.virtual('daysSinceJoined').get(function() {
  if (!this.profile.joinDate) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - this.profile.joinDate.getTime()) / msPerDay);
});

organizationMemberSchema.virtual('isNewMember').get(function() {
  return this.daysSinceJoined <= 90; // First 90 days
});

organizationMemberSchema.virtual('onboardingComplete').get(function() {
  return this.onboarding.status === 'completed';
});

organizationMemberSchema.virtual('hasRequiredTraining').get(function() {
  if (!this.training.requiredCourses || this.training.requiredCourses.length === 0) {
    return true;
  }
  return this.training.requiredCourses.every(course => course.status === 'completed');
});

// ==================== Pre-save Middleware ====================
organizationMemberSchema.pre('save', async function(next) {
  try {
    // Update status history
    if (this.isModified('status.state')) {
      if (!this.status.history) this.status.history = [];
      
      const previousState = this.status.history.length > 0 ? 
        this.status.history[this.status.history.length - 1].newState : 
        'pending';
      
      this.status.history.push({
        previousState,
        newState: this.status.state,
        changedAt: new Date()
      });

      // Update specific timestamps
      switch (this.status.state) {
        case 'active':
          if (!this.status.lastActiveAt) {
            this.status.lastActiveAt = new Date();
          }
          break;
        case 'suspended':
          this.status.suspendedAt = new Date();
          break;
        case 'offboarding':
          this.status.offboardingStarted = new Date();
          break;
        case 'offboarded':
          this.status.offboardingCompleted = new Date();
          break;
      }
    }

    // Ensure at least one primary role
    if (this.roles && this.roles.length > 0) {
      const hasPrimary = this.roles.some(r => r.isPrimary);
      if (!hasPrimary) {
        this.roles[0].isPrimary = true;
      }
    }

    // Calculate onboarding progress
    if (this.onboarding.checklist && this.onboarding.checklist.length > 0) {
      const completed = this.onboarding.checklist.filter(task => task.completed).length;
      this.onboarding.progress = Math.round((completed / this.onboarding.checklist.length) * 100);
      
      if (this.onboarding.progress === 100 && this.onboarding.status !== 'completed') {
        this.onboarding.status = 'completed';
        this.onboarding.completedAt = new Date();
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
organizationMemberSchema.methods.activate = async function(activatedBy) {
  if (this.status.state === 'active') {
    throw new AppError('Member is already active', 400, 'ALREADY_ACTIVE');
  }

  this.status.state = 'active';
  this.status.reactivatedAt = new Date();
  
  if (!this.status.history) this.status.history = [];
  this.status.history.push({
    previousState: this.status.state,
    newState: 'active',
    changedAt: new Date(),
    changedBy: activatedBy,
    reason: 'Manual activation'
  });

  await this.save();

  logger.info('Organization member activated', {
    memberId: this._id,
    userId: this.userId,
    organizationId: this.organizationId
  });

  return this;
};

organizationMemberSchema.methods.suspend = async function(reason, suspendedBy, until) {
  if (this.status.state === 'suspended') {
    throw new AppError('Member is already suspended', 400, 'ALREADY_SUSPENDED');
  }

  this.status.state = 'suspended';
  this.status.reason = reason;
  this.status.suspendedAt = new Date();
  if (until) {
    this.status.suspendedUntil = until;
  }

  if (!this.status.history) this.status.history = [];
  this.status.history.push({
    previousState: this.status.state,
    newState: 'suspended',
    changedAt: new Date(),
    changedBy: suspendedBy,
    reason
  });

  await this.save();

  logger.warn('Organization member suspended', {
    memberId: this._id,
    userId: this.userId,
    organizationId: this.organizationId,
    reason
  });

  return this;
};

organizationMemberSchema.methods.addRole = async function(roleData, assignedBy) {
  // Check if role already exists
  const existingRole = this.roles.find(r => 
    r.roleId?.toString() === roleData.roleId?.toString() || 
    r.roleName === roleData.roleName
  );

  if (existingRole) {
    throw new AppError('Role already assigned', 409, 'ROLE_ALREADY_ASSIGNED');
  }

  const newRole = {
    ...roleData,
    assignedAt: new Date(),
    assignedBy
  };

  // If this is the first role or marked as primary, set as primary
  if (this.roles.length === 0 || roleData.isPrimary) {
    // Remove primary from other roles if setting new primary
    if (roleData.isPrimary) {
      this.roles.forEach(r => { r.isPrimary = false; });
    }
    newRole.isPrimary = true;
  }

  this.roles.push(newRole);
  await this.save();

  logger.info('Role added to organization member', {
    memberId: this._id,
    roleName: newRole.roleName,
    assignedBy
  });

  return this;
};

organizationMemberSchema.methods.removeRole = async function(roleId, removedBy, reason) {
  const roleIndex = this.roles.findIndex(r => 
    r.roleId?.toString() === roleId || r._id?.toString() === roleId
  );

  if (roleIndex === -1) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  const removedRole = this.roles[roleIndex];
  
  // Prevent removing the last role
  if (this.roles.length === 1) {
    throw new AppError('Cannot remove last role', 400, 'CANNOT_REMOVE_LAST_ROLE');
  }

  // If removing primary role, assign primary to another role
  if (removedRole.isPrimary && this.roles.length > 1) {
    const nextRole = this.roles.find((r, i) => i !== roleIndex);
    if (nextRole) nextRole.isPrimary = true;
  }

  this.roles.splice(roleIndex, 1);

  // Add note about role removal
  if (!this.metadata.notes) this.metadata.notes = [];
  this.metadata.notes.push({
    content: `Role '${removedRole.roleName}' removed. Reason: ${reason || 'Not specified'}`,
    type: 'general',
    addedBy: removedBy,
    addedAt: new Date()
  });

  await this.save();

  logger.info('Role removed from organization member', {
    memberId: this._id,
    roleName: removedRole.roleName,
    removedBy,
    reason
  });

  return this;
};

organizationMemberSchema.methods.updatePermissions = async function(permissions, grantedBy) {
  permissions.forEach(permission => {
    permission.grantedAt = new Date();
    permission.grantedBy = grantedBy;
  });

  this.permissions.direct = permissions;
  await this.save();

  logger.info('Member permissions updated', {
    memberId: this._id,
    permissionCount: permissions.length,
    grantedBy
  });

  return this;
};

organizationMemberSchema.methods.hasPermission = function(resource, action) {
  // Check direct permissions
  const directPermission = this.permissions.direct.find(p => 
    p.resource === resource && p.actions.includes(action) && p.granted
  );

  if (directPermission) {
    // Check if expired
    if (directPermission.expiresAt && directPermission.expiresAt < new Date()) {
      return false;
    }
    return true;
  }

  // Check restrictions
  const restriction = this.permissions.restrictions.find(r => 
    r.resource === resource && r.actions.includes(action)
  );

  if (restriction) {
    // Check if still active
    if (!restriction.expiresAt || restriction.expiresAt > new Date()) {
      return false;
    }
  }

  // Check inherited permissions (would need role population)
  // This is simplified - in practice would check populated role permissions
  return this.isAdmin;
};

organizationMemberSchema.methods.assignToDepartment = async function(departmentData) {
  if (!this.assignments.departments) {
    this.assignments.departments = [];
  }

  const existing = this.assignments.departments.find(d => 
    d.departmentId?.toString() === departmentData.departmentId?.toString()
  );

  if (existing) {
    throw new AppError('Already assigned to this department', 409, 'ALREADY_IN_DEPARTMENT');
  }

  this.assignments.departments.push({
    ...departmentData,
    joinedAt: new Date()
  });

  await this.save();
  return this;
};

organizationMemberSchema.methods.assignToTeam = async function(teamData) {
  if (!this.assignments.teams) {
    this.assignments.teams = [];
  }

  const existing = this.assignments.teams.find(t => 
    t.teamId?.toString() === teamData.teamId?.toString()
  );

  if (existing) {
    throw new AppError('Already assigned to this team', 409, 'ALREADY_IN_TEAM');
  }

  this.assignments.teams.push({
    ...teamData,
    joinedAt: new Date()
  });

  await this.save();
  return this;
};

organizationMemberSchema.methods.recordActivity = async function(activityType, details = {}) {
  this.activity.lastActivityAt = new Date();
  this.activity.totalActions += 1;

  // Update contributions based on activity type
  switch (activityType) {
    case 'document_created':
      this.activity.contributions.documentsCreated += 1;
      break;
    case 'document_edited':
      this.activity.contributions.documentsEdited += 1;
      break;
    case 'task_completed':
      this.activity.contributions.tasksCompleted += 1;
      break;
    case 'comment_added':
      this.activity.contributions.commentsAdded += 1;
      break;
    case 'meeting_attended':
      this.activity.contributions.meetingsAttended += 1;
      break;
  }

  // Track feature usage
  if (details.feature) {
    const featureIndex = this.activity.mostUsedFeatures.findIndex(f => 
      f.feature === details.feature
    );

    if (featureIndex > -1) {
      this.activity.mostUsedFeatures[featureIndex].count += 1;
      this.activity.mostUsedFeatures[featureIndex].lastUsedAt = new Date();
    } else {
      this.activity.mostUsedFeatures.push({
        feature: details.feature,
        count: 1,
        lastUsedAt: new Date()
      });
    }

    // Keep only top 10 features
    this.activity.mostUsedFeatures.sort((a, b) => b.count - a.count);
    this.activity.mostUsedFeatures = this.activity.mostUsedFeatures.slice(0, 10);
  }

  // Don't await save to avoid blocking
  this.save().catch(err => {
    logger.error('Failed to record member activity', { error: err, memberId: this._id });
  });

  return this;
};

organizationMemberSchema.methods.completeOnboardingTask = async function(taskId, verifiedBy) {
  const task = this.onboarding.checklist.find(t => t.taskId === taskId);
  
  if (!task) {
    throw new AppError('Onboarding task not found', 404, 'TASK_NOT_FOUND');
  }

  if (task.completed) {
    throw new AppError('Task already completed', 400, 'TASK_ALREADY_COMPLETED');
  }

  task.completed = true;
  task.completedAt = new Date();
  if (verifiedBy) {
    task.verifiedBy = verifiedBy;
  }

  // Update progress
  const completed = this.onboarding.checklist.filter(t => t.completed).length;
  this.onboarding.progress = Math.round((completed / this.onboarding.checklist.length) * 100);

  // Check if onboarding is complete
  if (this.onboarding.progress === 100) {
    this.onboarding.status = 'completed';
    this.onboarding.completedAt = new Date();
    
    // Activate member if still pending
    if (this.status.state === 'pending') {
      this.status.state = 'active';
    }
  } else if (this.onboarding.status === 'not-started') {
    this.onboarding.status = 'in-progress';
    this.onboarding.startedAt = new Date();
  }

  await this.save();

  logger.info('Onboarding task completed', {
    memberId: this._id,
    taskId,
    progress: this.onboarding.progress
  });

  return this;
};

organizationMemberSchema.methods.addTrainingCourse = async function(courseData) {
  if (!this.training.requiredCourses) {
    this.training.requiredCourses = [];
  }

  this.training.requiredCourses.push({
    ...courseData,
    status: 'not-started',
    progress: 0
  });

  await this.save();
  return this;
};

organizationMemberSchema.methods.updateTrainingProgress = async function(courseId, progress, score) {
  const course = this.training.requiredCourses.find(c => c.courseId === courseId);
  
  if (!course) {
    throw new AppError('Training course not found', 404, 'COURSE_NOT_FOUND');
  }

  course.progress = progress;
  
  if (progress === 0 && course.status === 'not-started') {
    course.status = 'in-progress';
    course.startedAt = new Date();
  } else if (progress === 100) {
    course.status = 'completed';
    course.completedAt = new Date();
    if (score !== undefined) {
      course.score = score;
    }

    // Add to completed courses
    if (!this.training.completedCourses) {
      this.training.completedCourses = [];
    }
    this.training.completedCourses.push({
      courseId: course.courseId,
      title: course.title,
      completedAt: course.completedAt,
      score: course.score,
      certificateUrl: course.certificateUrl
    });
  } else if (progress > 0) {
    course.status = 'in-progress';
  }

  await this.save();

  logger.info('Training progress updated', {
    memberId: this._id,
    courseId,
    progress,
    status: course.status
  });

  return this;
};

organizationMemberSchema.methods.startOffboarding = async function(reason, initiatedBy) {
  if (this.status.state === 'offboarded') {
    throw new AppError('Member already offboarded', 400, 'ALREADY_OFFBOARDED');
  }

  this.status.state = 'offboarding';
  this.status.reason = reason;
  this.status.offboardingStarted = new Date();

  if (!this.status.history) this.status.history = [];
  this.status.history.push({
    previousState: this.status.state,
    newState: 'offboarding',
    changedAt: new Date(),
    changedBy: initiatedBy,
    reason
  });

  // Suspend access immediately
  this.access.level = 'basic';
  
  await this.save();

  logger.info('Member offboarding started', {
    memberId: this._id,
    userId: this.userId,
    organizationId: this.organizationId,
    reason
  });

  return this;
};

// ==================== Static Methods ====================
organizationMemberSchema.statics.findByOrganization = async function(organizationId, options = {}) {
  const query = {
    organizationId,
    'status.state': { $ne: 'offboarded' }
  };

  if (options.activeOnly) {
    query['status.state'] = 'active';
  }

  if (options.role) {
    query['roles.roleName'] = options.role;
  }

  if (options.department) {
    query['assignments.departments.departmentId'] = options.department;
  }

  if (options.team) {
    query['assignments.teams.teamId'] = options.team;
  }

  const queryBuilder = this.find(query);

  if (options.populate) {
    queryBuilder.populate('userId', 'email profile.firstName profile.lastName')
                .populate('roles.roleId', 'name permissions');
  }

  return await queryBuilder.sort(options.sort || { 'profile.joinDate': -1 });
};

organizationMemberSchema.statics.findByUser = async function(userId, options = {}) {
  const query = {
    userId,
    'status.state': { $ne: 'offboarded' }
  };

  if (options.activeOnly) {
    query['status.state'] = 'active';
  }

  const queryBuilder = this.find(query);

  if (options.populate) {
    queryBuilder.populate('organizationId', 'name slug displayName');
  }

  return await queryBuilder.sort({ createdAt: -1 });
};

organizationMemberSchema.statics.createMember = async function(data) {
  // Check if member already exists
  const existing = await this.findOne({
    organizationId: data.organizationId,
    userId: data.userId
  });

  if (existing) {
    throw new AppError('User is already a member of this organization', 409, 'ALREADY_MEMBER');
  }

  const member = new this(data);
  await member.save();

  logger.info('Organization member created', {
    memberId: member._id,
    userId: data.userId,
    organizationId: data.organizationId
  });

  return member;
};

organizationMemberSchema.statics.bulkCreate = async function(members, organizationId) {
  const results = {
    successful: [],
    failed: []
  };

  for (const memberData of members) {
    try {
      const member = await this.createMember({
        ...memberData,
        organizationId
      });
      results.successful.push({
        userId: member.userId,
        memberId: member._id
      });
    } catch (error) {
      results.failed.push({
        userId: memberData.userId,
        error: error.message
      });
    }
  }

  return results;
};

organizationMemberSchema.statics.getOrganizationStats = async function(organizationId) {
  const stats = await this.aggregate([
    { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ['$status.state', 'active'] }, 1, 0] }
              },
              pending: {
                $sum: { $cond: [{ $eq: ['$status.state', 'pending'] }, 1, 0] }
              },
              suspended: {
                $sum: { $cond: [{ $eq: ['$status.state', 'suspended'] }, 1, 0] }
              },
              offboarding: {
                $sum: { $cond: [{ $eq: ['$status.state', 'offboarding'] }, 1, 0] }
              }
            }
          }
        ],
        byRole: [
          { $unwind: '$roles' },
          {
            $group: {
              _id: '$roles.roleName',
              count: { $sum: 1 }
            }
          }
        ],
        byDepartment: [
          { $unwind: { path: '$assignments.departments', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: '$assignments.departments.name',
              count: { $sum: 1 }
            }
          }
        ],
        byAccessLevel: [
          {
            $group: {
              _id: '$access.level',
              count: { $sum: 1 }
            }
          }
        ],
        activityMetrics: [
          {
            $group: {
              _id: null,
              avgLoginCount: { $avg: '$activity.loginCount' },
              avgActions: { $avg: '$activity.totalActions' },
              recentlyActive: {
                $sum: {
                  $cond: [
                    {
                      $gte: [
                        '$activity.lastActivityAt',
                        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                      ]
                    },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ],
        onboarding: [
          {
            $group: {
              _id: '$onboarding.status',
              count: { $sum: 1 },
              avgProgress: { $avg: '$onboarding.progress' }
            }
          }
        ]
      }
    }
  ]);

  const result = stats[0];

  return {
    overview: result.overview[0] || {
      total: 0,
      active: 0,
      pending: 0,
      suspended: 0,
      offboarding: 0
    },
    distribution: {
      byRole: result.byRole,
      byDepartment: result.byDepartment,
      byAccessLevel: result.byAccessLevel
    },
    activity: result.activityMetrics[0] || {
      avgLoginCount: 0,
      avgActions: 0,
      recentlyActive: 0
    },
    onboarding: result.onboarding
  };
};

organizationMemberSchema.statics.searchMembers = async function(organizationId, searchQuery, options = {}) {
  const {
    role,
    department,
    team,
    status = 'active',
    limit = 20,
    skip = 0,
    sort = { 'profile.displayName': 1 }
  } = options;

  const query = {
    organizationId,
    'status.state': status,
    $or: [
      { 'profile.displayName': new RegExp(searchQuery, 'i') },
      { 'profile.title': new RegExp(searchQuery, 'i') },
      { 'profile.employeeId': new RegExp(searchQuery, 'i') },
      { 'metadata.tags': new RegExp(searchQuery, 'i') }
    ]
  };

  if (role) {
    query['roles.roleName'] = role;
  }

  if (department) {
    query['assignments.departments.departmentId'] = department;
  }

  if (team) {
    query['assignments.teams.teamId'] = team;
  }

  const [members, total] = await Promise.all([
    this.find(query)
      .populate('userId', 'email profile.firstName profile.lastName')
      .limit(limit)
      .skip(skip)
      .sort(sort),
    this.countDocuments(query)
  ]);

  return {
    members,
    total,
    hasMore: total > skip + members.length
  };
};

organizationMemberSchema.statics.getInactiveMembers = async function(organizationId, daysInactive = 30) {
  const inactiveDate = new Date(Date.now() - daysInactive * 24 * 60 * 60 * 1000);
  
  return await this.find({
    organizationId,
    'status.state': 'active',
    $or: [
      { 'activity.lastActivityAt': { $lt: inactiveDate } },
      { 'activity.lastActivityAt': { $exists: false } }
    ]
  }).populate('userId', 'email profile.firstName profile.lastName');
};

// Create and export model
const OrganizationMemberModel = BaseModel.createModel('OrganizationMember', organizationMemberSchema);

module.exports = OrganizationMemberModel;