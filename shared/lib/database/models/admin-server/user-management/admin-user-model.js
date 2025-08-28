'use strict';

/**
 * @fileoverview Enhanced administrative user model for platform user management
 * @module servers/admin-server/modules/user-management/models/admin-user-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/hash-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/roles
 * @requires module:shared/lib/utils/constants/permissions
 */

const mongoose = require('mongoose');
const BaseModel = require('../../base-model');
const logger = require('../../../../utils/logger');
const { AppError } = require('../../../../utils/app-error');
const HashService = require('../../../../security/encryption/hash-service');
const CommonValidator = require('../../../../utils/validators/common-validators');
const stringHelper = require('../../../../utils/helpers/string-helper');
const dateHelper = require('../../../../utils/helpers/date-helper');
const { ROLES } = require('../../../../utils/constants/roles');
const { PERMISSIONS } = require('../../../../utils/constants/permissions');

/**
 * Enhanced administrative user schema definition for platform management
 */
const adminUserSchemaDefinition = {
  // ==================== Core Identity Management ====================
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
    description: 'Reference to core user entity in shared models'
  },
  
  administrativeId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `ADM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique administrative identifier for platform management'
  },
  
  adminProfile: {
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
      description: 'Administrative display name for internal use'
    },
    
    department: {
      type: String,
      required: true,
      enum: ['EXECUTIVE', 'OPERATIONS', 'TECHNICAL', 'SUPPORT', 'SECURITY', 'COMPLIANCE', 'FINANCE', 'HUMAN_RESOURCES'],
      index: true,
      description: 'Administrative department assignment'
    },
    
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      description: 'Administrative job title'
    },
    
    employeeId: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
      description: 'Internal employee identification number'
    },
    
    reportingTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      index: true,
      description: 'Direct reporting manager reference'
    },
    
    teamMembers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      description: 'Team members under this administrator'
    }],
    
    officeLocation: {
      type: String,
      trim: true,
      description: 'Physical office location or remote designation'
    },
    
    timezone: {
      type: String,
      required: true,
      default: 'UTC',
      description: 'Administrator timezone for scheduling'
    },
    
    workSchedule: {
      startTime: String,
      endTime: String,
      workDays: {
        type: [String],
        enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
      },
      isFlexible: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // ==================== Administrative Roles & Permissions ====================
  administrativeRoles: [{
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
      description: 'Reference to role definition'
    },
    
    roleName: {
      type: String,
      required: true,
      enum: Object.values(ROLES.ADMIN),
      description: 'Administrative role name for quick reference'
    },
    
    assignedAt: {
      type: Date,
      default: Date.now,
      required: true,
      description: 'Timestamp of role assignment'
    },
    
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: true,
      description: 'Administrator who assigned this role'
    },
    
    expiresAt: {
      type: Date,
      index: true,
      description: 'Optional role expiration date'
    },
    
    scope: {
      type: String,
      enum: ['GLOBAL', 'REGIONAL', 'DEPARTMENTAL', 'PROJECT', 'TEMPORARY'],
      default: 'DEPARTMENTAL',
      description: 'Scope of role application'
    },
    
    restrictions: [{
      type: String,
      description: 'Specific restrictions on this role'
    }],
    
    metadata: {
      reason: String,
      approvalTicket: String,
      reviewDate: Date,
      notes: String
    }
  }],
  
  granularPermissions: {
    userManagement: {
      create: { type: Boolean, default: false },
      read: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
      bulkOperations: { type: Boolean, default: false },
      impersonate: { type: Boolean, default: false },
      forceLogout: { type: Boolean, default: false },
      resetPasswords: { type: Boolean, default: false },
      manageRoles: { type: Boolean, default: false },
      viewSensitiveData: { type: Boolean, default: false }
    },
    
    organizationManagement: {
      create: { type: Boolean, default: false },
      read: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
      manageTenants: { type: Boolean, default: false },
      manageSubscriptions: { type: Boolean, default: false },
      manageBilling: { type: Boolean, default: false },
      viewFinancials: { type: Boolean, default: false },
      modifyContracts: { type: Boolean, default: false }
    },
    
    systemAdministration: {
      viewSystemHealth: { type: Boolean, default: false },
      modifyConfiguration: { type: Boolean, default: false },
      accessLogs: { type: Boolean, default: false },
      performMaintenance: { type: Boolean, default: false },
      manageIntegrations: { type: Boolean, default: false },
      deployUpdates: { type: Boolean, default: false },
      accessDatabase: { type: Boolean, default: false },
      manageBackups: { type: Boolean, default: false },
      emergencyAccess: { type: Boolean, default: false }
    },
    
    securityAdministration: {
      viewSecurityLogs: { type: Boolean, default: false },
      managePolicies: { type: Boolean, default: false },
      performAudits: { type: Boolean, default: false },
      manageCompliance: { type: Boolean, default: false },
      investigateIncidents: { type: Boolean, default: false },
      manageEncryption: { type: Boolean, default: false },
      configureFirewall: { type: Boolean, default: false },
      manageCertificates: { type: Boolean, default: false }
    },
    
    supportAdministration: {
      viewTickets: { type: Boolean, default: false },
      manageTickets: { type: Boolean, default: false },
      escalateIssues: { type: Boolean, default: false },
      accessKnowledgeBase: { type: Boolean, default: false },
      modifyKnowledgeBase: { type: Boolean, default: false },
      viewCustomerData: { type: Boolean, default: false },
      communicateWithCustomers: { type: Boolean, default: false }
    },
    
    analyticsAdministration: {
      viewReports: { type: Boolean, default: false },
      createReports: { type: Boolean, default: false },
      exportData: { type: Boolean, default: false },
      viewDashboards: { type: Boolean, default: false },
      createDashboards: { type: Boolean, default: false },
      accessRawData: { type: Boolean, default: false },
      performDataAnalysis: { type: Boolean, default: false }
    }
  },
  
  // ==================== Access Control & Security ====================
  accessControl: {
    ipWhitelist: [{
      address: {
        type: String,
        required: true,
        validate: {
          validator: CommonValidator.isValidIP,
          message: 'Invalid IP address format'
        }
      },
      description: String,
      addedAt: {
        type: Date,
        default: Date.now
      },
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }
    }],
    
    accessHours: {
      enabled: {
        type: Boolean,
        default: false
      },
      schedule: [{
        dayOfWeek: {
          type: Number,
          min: 0,
          max: 6
        },
        startTime: String,
        endTime: String,
        timezone: String
      }]
    },
    
    geofencing: {
      enabled: {
        type: Boolean,
        default: false
      },
      allowedCountries: [{
        type: String,
        uppercase: true,
        minlength: 2,
        maxlength: 2
      }],
      allowedRegions: [String],
      blockedCountries: [{
        type: String,
        uppercase: true,
        minlength: 2,
        maxlength: 2
      }]
    },
    
    deviceRestrictions: {
      enabled: {
        type: Boolean,
        default: false
      },
      registeredDevices: [{
        deviceId: String,
        deviceType: String,
        deviceName: String,
        registeredAt: Date,
        lastUsed: Date,
        fingerprint: String,
        trusted: {
          type: Boolean,
          default: false
        }
      }],
      maxDevices: {
        type: Number,
        default: 5,
        min: 1,
        max: 10
      }
    },
    
    mfaRequirements: {
      enforced: {
        type: Boolean,
        default: true
      },
      methods: [{
        type: String,
        enum: ['TOTP', 'SMS', 'EMAIL', 'HARDWARE_TOKEN', 'BIOMETRIC', 'PUSH_NOTIFICATION']
      }],
      backupCodes: [{
        code: String,
        usedAt: Date,
        generatedAt: Date
      }],
      gracePeriodUntil: Date
    },
    
    sessionRestrictions: {
      maxConcurrentSessions: {
        type: Number,
        default: 3,
        min: 1,
        max: 10
      },
      sessionTimeout: {
        type: Number,
        default: 3600000, // 1 hour in milliseconds
        min: 300000, // 5 minutes
        max: 86400000 // 24 hours
      },
      idleTimeout: {
        type: Number,
        default: 900000, // 15 minutes
        min: 60000, // 1 minute
        max: 3600000 // 1 hour
      },
      requireReauthentication: {
        forSensitiveOperations: {
          type: Boolean,
          default: true
        },
        afterIdleMinutes: {
          type: Number,
          default: 30
        }
      }
    }
  },
  
  // ==================== Activity Tracking & Monitoring ====================
  activityTracking: {
    lastLogin: {
      timestamp: Date,
      ipAddress: String,
      userAgent: String,
      location: {
        country: String,
        region: String,
        city: String,
        coordinates: {
          latitude: Number,
          longitude: Number
        }
      },
      sessionId: String,
      deviceInfo: {
        type: String,
        os: String,
        browser: String
      }
    },
    
    loginHistory: [{
      timestamp: {
        type: Date,
        default: Date.now
      },
      ipAddress: String,
      success: Boolean,
      failureReason: String,
      userAgent: String,
      location: {
        country: String,
        region: String,
        city: String
      },
      suspiciousActivity: {
        detected: Boolean,
        reason: String,
        riskScore: Number
      }
    }],
    
    recentActions: [{
      action: {
        type: String,
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      resourceType: String,
      resourceId: String,
      changes: mongoose.Schema.Types.Mixed,
      ipAddress: String,
      userAgent: String,
      result: {
        success: Boolean,
        errorMessage: String,
        statusCode: Number
      }
    }],
    
    criticalOperations: [{
      operation: {
        type: String,
        required: true,
        enum: ['USER_DELETION', 'BULK_UPDATE', 'PERMISSION_CHANGE', 'ROLE_ASSIGNMENT', 
                'SECURITY_POLICY_CHANGE', 'DATA_EXPORT', 'SYSTEM_CONFIGURATION', 'EMERGENCY_ACCESS']
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      targetType: String,
      targetId: String,
      targetDescription: String,
      reason: String,
      approvalTicket: String,
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      auditNotes: String
    }],
    
    performanceMetrics: {
      totalLogins: {
        type: Number,
        default: 0
      },
      totalActions: {
        type: Number,
        default: 0
      },
      averageSessionDuration: {
        type: Number,
        default: 0
      },
      lastActivityScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      efficiency: {
        tasksCompleted: Number,
        averageCompletionTime: Number,
        errorRate: Number
      }
    }
  },
  
  // ==================== Administrative Metadata ====================
  administrativeMetadata: {
    onboardingStatus: {
      status: {
        type: String,
        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'],
        default: 'PENDING'
      },
      startedAt: Date,
      completedAt: Date,
      steps: [{
        name: String,
        completed: Boolean,
        completedAt: Date
      }],
      trainingModules: [{
        moduleId: String,
        moduleName: String,
        completed: Boolean,
        score: Number,
        completedAt: Date
      }]
    },
    
    certifications: [{
      name: {
        type: String,
        required: true
      },
      issuer: String,
      issueDate: Date,
      expiryDate: Date,
      verificationUrl: String,
      certificateNumber: String,
      status: {
        type: String,
        enum: ['ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING_RENEWAL']
      }
    }],
    
    emergencyContact: {
      name: String,
      relationship: String,
      phoneNumber: String,
      email: String,
      alternatePhone: String
    },
    
    complianceTraining: [{
      trainingName: String,
      completedDate: Date,
      expiryDate: Date,
      score: Number,
      certificateUrl: String,
      mandatory: Boolean
    }],
    
    administrativeNotes: [{
      note: {
        type: String,
        required: true
      },
      category: {
        type: String,
        enum: ['PERFORMANCE', 'INCIDENT', 'TRAINING', 'GENERAL', 'SECURITY', 'COMPLIANCE']
      },
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      addedAt: {
        type: Date,
        default: Date.now
      },
      visibility: {
        type: String,
        enum: ['PRIVATE', 'MANAGERS', 'HR', 'PUBLIC'],
        default: 'PRIVATE'
      }
    }],
    
    resourceQuotas: {
      maxManagedUsers: {
        type: Number,
        default: 1000
      },
      maxManagedOrganizations: {
        type: Number,
        default: 100
      },
      maxConcurrentOperations: {
        type: Number,
        default: 10
      },
      apiRateLimit: {
        requestsPerMinute: {
          type: Number,
          default: 100
        },
        requestsPerHour: {
          type: Number,
          default: 5000
        }
      },
      storageQuota: {
        maxBytes: Number,
        usedBytes: {
          type: Number,
          default: 0
        }
      }
    }
  },
  
  // ==================== Status & Lifecycle Management ====================
  status: {
    accountStatus: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED', 'PENDING_APPROVAL', 'LOCKED'],
      default: 'PENDING_APPROVAL',
      required: true,
      index: true
    },
    
    suspensionDetails: {
      suspended: {
        type: Boolean,
        default: false
      },
      suspendedAt: Date,
      suspendedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      suspensionReason: String,
      suspensionDuration: Number,
      autoReactivateAt: Date,
      reviewRequired: {
        type: Boolean,
        default: true
      }
    },
    
    terminationDetails: {
      terminated: {
        type: Boolean,
        default: false
      },
      terminatedAt: Date,
      terminatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      terminationReason: String,
      offboardingCompleted: {
        type: Boolean,
        default: false
      },
      dataRetentionUntil: Date,
      accessRevokedAt: Date
    },
    
    lockoutDetails: {
      isLocked: {
        type: Boolean,
        default: false
      },
      lockedAt: Date,
      lockReason: String,
      failedAttempts: {
        type: Number,
        default: 0
      },
      unlockAt: Date,
      permanentLock: {
        type: Boolean,
        default: false
      }
    },
    
    approvalStatus: {
      approved: {
        type: Boolean,
        default: false
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      approvedAt: Date,
      approvalNotes: String,
      pendingApprovals: [{
        type: String,
        requestedAt: Date,
        requestedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AdminUser'
        }
      }]
    }
  },
  
  // ==================== Audit & Compliance ====================
  auditLog: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: true
    },
    
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    
    modifications: [{
      modifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      modifiedAt: {
        type: Date,
        default: Date.now
      },
      changes: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      },
      reason: String,
      approvalTicket: String
    }],
    
    accessLog: [{
      accessedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      accessedAt: {
        type: Date,
        default: Date.now
      },
      accessType: {
        type: String,
        enum: ['VIEW', 'EDIT', 'DELETE', 'EXPORT', 'AUDIT']
      },
      dataAccessed: [String],
      ipAddress: String,
      justification: String
    }],
    
    complianceChecks: [{
      checkType: {
        type: String,
        enum: ['GDPR', 'HIPAA', 'SOX', 'PCI_DSS', 'ISO_27001', 'CUSTOM']
      },
      performedAt: {
        type: Date,
        default: Date.now
      },
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      result: {
        type: String,
        enum: ['PASSED', 'FAILED', 'PARTIAL', 'PENDING']
      },
      findings: [String],
      remediationRequired: Boolean,
      nextCheckDate: Date
    }]
  }
};

const adminUserSchema = BaseModel.createSchema(adminUserSchemaDefinition, {
  collection: 'admin_users',
  timestamps: true,
  versionKey: '__v',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// ==================== Indexes for Performance ====================
adminUserSchema.index({ 'adminProfile.department': 1, 'status.accountStatus': 1 });
adminUserSchema.index({ 'administrativeRoles.roleName': 1 });
adminUserSchema.index({ 'administrativeRoles.expiresAt': 1 }, { sparse: true });
adminUserSchema.index({ 'activityTracking.lastLogin.timestamp': -1 });
adminUserSchema.index({ 'status.accountStatus': 1, 'adminProfile.department': 1 });
adminUserSchema.index({ 'administrativeMetadata.onboardingStatus.status': 1 });
adminUserSchema.index({ createdAt: -1 });
adminUserSchema.index({ 'accessControl.ipWhitelist.address': 1 });
adminUserSchema.index({ 'administrativeRoles.scope': 1, 'administrativeRoles.roleName': 1 });

// ==================== Virtual Properties ====================
adminUserSchema.virtual('fullName').get(function() {
  return this.adminProfile?.displayName || 'Unknown Administrator';
});

adminUserSchema.virtual('isActive').get(function() {
  return this.status.accountStatus === 'ACTIVE' && 
         !this.status.suspensionDetails.suspended &&
         !this.status.terminationDetails.terminated &&
         !this.status.lockoutDetails.isLocked;
});

adminUserSchema.virtual('effectivePermissions').get(function() {
  const permissions = new Set();
  
  // Aggregate permissions from all roles
  this.administrativeRoles.forEach(role => {
    if (!role.expiresAt || role.expiresAt > new Date()) {
      // Add role-based permissions
      const rolePermissions = this.getRolePermissions(role.roleName);
      rolePermissions.forEach(perm => permissions.add(perm));
    }
  });
  
  // Add granular permissions
  Object.entries(this.granularPermissions).forEach(([category, perms]) => {
    Object.entries(perms).forEach(([action, granted]) => {
      if (granted) {
        permissions.add(`${category}.${action}`);
      }
    });
  });
  
  return Array.from(permissions);
});

// ==================== Pre-Save Middleware ====================
adminUserSchema.pre('save', async function(next) {
  try {
    // Validate role assignments
    if (this.isModified('administrativeRoles')) {
      for (const role of this.administrativeRoles) {
        if (!this.validateRoleAssignment(role)) {
          throw new AppError('Invalid role assignment configuration', 400);
        }
      }
    }
    
    // Update activity metrics
    if (this.isModified('activityTracking.recentActions')) {
      this.updatePerformanceMetrics();
    }
    
    // Check for expired roles
    if (this.administrativeRoles?.length > 0) {
      this.administrativeRoles = this.administrativeRoles.filter(role => {
        return !role.expiresAt || role.expiresAt > new Date();
      });
    }
    
    // Validate IP whitelist
    if (this.isModified('accessControl.ipWhitelist')) {
      for (const entry of this.accessControl.ipWhitelist) {
        if (!CommonValidator.isValidIP(entry.address)) {
          throw new AppError(`Invalid IP address: ${entry.address}`, 400);
        }
      }
    }
    
    // Auto-lock account after too many failed attempts
    if (this.status.lockoutDetails.failedAttempts >= 5) {
      this.status.lockoutDetails.isLocked = true;
      this.status.lockoutDetails.lockedAt = new Date();
      this.status.lockoutDetails.lockReason = 'Exceeded maximum failed login attempts';
      this.status.lockoutDetails.unlockAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    }
    
    next();
  } catch (error) {
    logger.error('Pre-save error in AdminUser model:', error);
    next(error);
  }
});

// ==================== Instance Methods ====================
adminUserSchema.methods.validateRoleAssignment = function(role) {
  // Validate role expiry
  if (role.expiresAt && role.expiresAt < new Date()) {
    return false;
  }
  
  // Validate role scope
  const validScopes = ['GLOBAL', 'REGIONAL', 'DEPARTMENTAL', 'PROJECT', 'TEMPORARY'];
  if (!validScopes.includes(role.scope)) {
    return false;
  }
  
  // Validate role conflicts
  const conflictingRoles = this.getConflictingRoles(role.roleName);
  const hasConflict = this.administrativeRoles.some(existingRole => 
    conflictingRoles.includes(existingRole.roleName) &&
    (!existingRole.expiresAt || existingRole.expiresAt > new Date())
  );
  
  return !hasConflict;
};

adminUserSchema.methods.getRolePermissions = function(roleName) {
  const rolePermissionMap = {
    'SUPER_ADMIN': ['*'],
    'SYSTEM_ADMIN': [
      'systemAdministration.*',
      'userManagement.read',
      'organizationManagement.read',
      'analyticsAdministration.*'
    ],
    'USER_ADMIN': [
      'userManagement.*',
      'organizationManagement.read',
      'supportAdministration.viewTickets'
    ],
    'SECURITY_ADMIN': [
      'securityAdministration.*',
      'userManagement.read',
      'systemAdministration.viewSystemHealth',
      'systemAdministration.accessLogs'
    ],
    'SUPPORT_ADMIN': [
      'supportAdministration.*',
      'userManagement.read',
      'organizationManagement.read'
    ],
    'BILLING_ADMIN': [
      'organizationManagement.manageBilling',
      'organizationManagement.viewFinancials',
      'organizationManagement.manageSubscriptions',
      'analyticsAdministration.viewReports'
    ],
    'COMPLIANCE_OFFICER': [
      'securityAdministration.manageCompliance',
      'securityAdministration.performAudits',
      'analyticsAdministration.viewReports',
      'analyticsAdministration.exportData'
    ],
    'READ_ONLY_ADMIN': [
      '*.read',
      '*.view*'
    ]
  };
  
  return rolePermissionMap[roleName] || [];
};

adminUserSchema.methods.getConflictingRoles = function(roleName) {
  const conflictMap = {
    'SUPER_ADMIN': ['READ_ONLY_ADMIN'],
    'SYSTEM_ADMIN': ['READ_ONLY_ADMIN'],
    'USER_ADMIN': ['READ_ONLY_ADMIN'],
    'SECURITY_ADMIN': ['SUPPORT_ADMIN'],
    'READ_ONLY_ADMIN': ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'USER_ADMIN', 'SECURITY_ADMIN']
  };
  
  return conflictMap[roleName] || [];
};

adminUserSchema.methods.hasPermission = function(permission) {
  // Super admin has all permissions
  if (this.administrativeRoles.some(role => role.roleName === 'SUPER_ADMIN')) {
    return true;
  }
  
  // Check effective permissions
  const effectivePerms = this.effectivePermissions;
  
  // Direct permission match
  if (effectivePerms.includes(permission)) {
    return true;
  }
  
  // Wildcard permission match
  const permissionParts = permission.split('.');
  for (const perm of effectivePerms) {
    if (perm.includes('*')) {
      const permPattern = perm.replace(/\*/g, '.*');
      const regex = new RegExp(`^${permPattern}$`);
      if (regex.test(permission)) {
        return true;
      }
    }
  }
  
  return false;
};

adminUserSchema.methods.assignRole = async function(roleData, assignedBy) {
  try {
    // Validate role assignment
    if (!this.validateRoleAssignment(roleData)) {
      throw new AppError('Role assignment validation failed', 400);
    }
    
    // Check if role already exists
    const existingRoleIndex = this.administrativeRoles.findIndex(
      role => role.roleName === roleData.roleName
    );
    
    if (existingRoleIndex >= 0) {
      // Update existing role
      this.administrativeRoles[existingRoleIndex] = {
        ...this.administrativeRoles[existingRoleIndex],
        ...roleData,
        assignedAt: new Date(),
        assignedBy
      };
    } else {
      // Add new role
      this.administrativeRoles.push({
        ...roleData,
        assignedAt: new Date(),
        assignedBy
      });
    }
    
    // Log the operation
    this.auditLog.modifications.push({
      modifiedBy: assignedBy,
      modifiedAt: new Date(),
      changes: new Map([['roleAssignment', roleData]]),
      reason: roleData.metadata?.reason || 'Role assignment'
    });
    
    await this.save();
    
    logger.info(`Role ${roleData.roleName} assigned to admin user ${this.administrativeId}`);
    return this;
  } catch (error) {
    logger.error('Error assigning role:', error);
    throw error;
  }
};

adminUserSchema.methods.revokeRole = async function(roleName, revokedBy, reason) {
  try {
    const roleIndex = this.administrativeRoles.findIndex(
      role => role.roleName === roleName
    );
    
    if (roleIndex < 0) {
      throw new AppError('Role not found', 404);
    }
    
    const removedRole = this.administrativeRoles[roleIndex];
    this.administrativeRoles.splice(roleIndex, 1);
    
    // Log the operation
    this.auditLog.modifications.push({
      modifiedBy: revokedBy,
      modifiedAt: new Date(),
      changes: new Map([['roleRevocation', { roleName, removedRole }]]),
      reason: reason || 'Role revocation'
    });
    
    await this.save();
    
    logger.info(`Role ${roleName} revoked from admin user ${this.administrativeId}`);
    return this;
  } catch (error) {
    logger.error('Error revoking role:', error);
    throw error;
  }
};

adminUserSchema.methods.updatePerformanceMetrics = function() {
  const recentActions = this.activityTracking.recentActions || [];
  
  // Calculate metrics
  this.activityTracking.performanceMetrics.totalActions = recentActions.length;
  
  // Calculate success rate
  const successfulActions = recentActions.filter(action => action.result?.success);
  const errorRate = recentActions.length > 0 
    ? ((recentActions.length - successfulActions.length) / recentActions.length) * 100
    : 0;
  
  this.activityTracking.performanceMetrics.efficiency = {
    tasksCompleted: successfulActions.length,
    errorRate: Math.round(errorRate * 100) / 100
  };
  
  // Calculate activity score
  const recentActivityCount = recentActions.filter(action => {
    const actionDate = new Date(action.timestamp);
    const daysSinceAction = (Date.now() - actionDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceAction <= 30;
  }).length;
  
  this.activityTracking.performanceMetrics.lastActivityScore = Math.min(100, recentActivityCount * 2);
};

adminUserSchema.methods.logAction = async function(actionData) {
  try {
    const action = {
      action: actionData.action,
      timestamp: new Date(),
      resourceType: actionData.resourceType,
      resourceId: actionData.resourceId,
      changes: actionData.changes,
      ipAddress: actionData.ipAddress,
      userAgent: actionData.userAgent,
      result: actionData.result
    };
    
    this.activityTracking.recentActions.push(action);
    
    // Keep only last 1000 actions
    if (this.activityTracking.recentActions.length > 1000) {
      this.activityTracking.recentActions = this.activityTracking.recentActions.slice(-1000);
    }
    
    // Check if it's a critical operation
    const criticalOps = ['USER_DELETION', 'BULK_UPDATE', 'PERMISSION_CHANGE', 'ROLE_ASSIGNMENT', 
                        'SECURITY_POLICY_CHANGE', 'DATA_EXPORT', 'SYSTEM_CONFIGURATION', 'EMERGENCY_ACCESS'];
    
    if (criticalOps.includes(actionData.action)) {
      this.activityTracking.criticalOperations.push({
        operation: actionData.action,
        timestamp: new Date(),
        targetType: actionData.resourceType,
        targetId: actionData.resourceId,
        targetDescription: actionData.targetDescription,
        reason: actionData.reason,
        approvalTicket: actionData.approvalTicket,
        reviewedBy: actionData.reviewedBy,
        auditNotes: actionData.auditNotes
      });
    }
    
    // Update performance metrics
    this.updatePerformanceMetrics();
    
    await this.save();
    return this;
  } catch (error) {
    logger.error('Error logging action:', error);
    throw error;
  }
};

adminUserSchema.methods.recordLogin = async function(loginData) {
  try {
    const loginRecord = {
      timestamp: new Date(),
      ipAddress: loginData.ipAddress,
      success: loginData.success,
      failureReason: loginData.failureReason,
      userAgent: loginData.userAgent,
      location: loginData.location,
      suspiciousActivity: loginData.suspiciousActivity
    };
    
    this.activityTracking.loginHistory.push(loginRecord);
    
    // Keep only last 100 login attempts
    if (this.activityTracking.loginHistory.length > 100) {
      this.activityTracking.loginHistory = this.activityTracking.loginHistory.slice(-100);
    }
    
    if (loginData.success) {
      this.activityTracking.lastLogin = {
        timestamp: new Date(),
        ipAddress: loginData.ipAddress,
        userAgent: loginData.userAgent,
        location: loginData.location,
        sessionId: loginData.sessionId,
        deviceInfo: loginData.deviceInfo
      };
      
      this.activityTracking.performanceMetrics.totalLogins += 1;
      this.status.lockoutDetails.failedAttempts = 0;
    } else {
      this.status.lockoutDetails.failedAttempts += 1;
    }
    
    await this.save();
    return this;
  } catch (error) {
    logger.error('Error recording login:', error);
    throw error;
  }
};

adminUserSchema.methods.suspendAccount = async function(suspensionData) {
  try {
    this.status.accountStatus = 'SUSPENDED';
    this.status.suspensionDetails = {
      suspended: true,
      suspendedAt: new Date(),
      suspendedBy: suspensionData.suspendedBy,
      suspensionReason: suspensionData.reason,
      suspensionDuration: suspensionData.duration,
      autoReactivateAt: suspensionData.duration 
        ? new Date(Date.now() + suspensionData.duration) 
        : null,
      reviewRequired: suspensionData.reviewRequired || true
    };
    
    // Log the suspension
    await this.logAction({
      action: 'ACCOUNT_SUSPENSION',
      resourceType: 'AdminUser',
      resourceId: this._id,
      changes: { status: 'SUSPENDED', reason: suspensionData.reason },
      result: { success: true }
    });
    
    await this.save();
    
    logger.info(`Admin account ${this.administrativeId} suspended`);
    return this;
  } catch (error) {
    logger.error('Error suspending account:', error);
    throw error;
  }
};

adminUserSchema.methods.reactivateAccount = async function(reactivationData) {
  try {
    if (this.status.accountStatus !== 'SUSPENDED' && this.status.accountStatus !== 'INACTIVE') {
      throw new AppError('Account is not suspended or inactive', 400);
    }
    
    this.status.accountStatus = 'ACTIVE';
    this.status.suspensionDetails = {
      suspended: false,
      suspendedAt: null,
      suspendedBy: null,
      suspensionReason: null,
      suspensionDuration: null,
      autoReactivateAt: null,
      reviewRequired: false
    };
    
    // Log the reactivation
    await this.logAction({
      action: 'ACCOUNT_REACTIVATION',
      resourceType: 'AdminUser',
      resourceId: this._id,
      changes: { status: 'ACTIVE', reactivatedBy: reactivationData.reactivatedBy },
      result: { success: true }
    });
    
    await this.save();
    
    logger.info(`Admin account ${this.administrativeId} reactivated`);
    return this;
  } catch (error) {
    logger.error('Error reactivating account:', error);
    throw error;
  }
};

adminUserSchema.methods.terminateAccount = async function(terminationData) {
  try {
    this.status.accountStatus = 'TERMINATED';
    this.status.terminationDetails = {
      terminated: true,
      terminatedAt: new Date(),
      terminatedBy: terminationData.terminatedBy,
      terminationReason: terminationData.reason,
      offboardingCompleted: false,
      dataRetentionUntil: new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)), // 90 days
      accessRevokedAt: new Date()
    };
    
    // Revoke all active sessions
    this.accessControl.sessionRestrictions.maxConcurrentSessions = 0;
    
    // Log the termination
    await this.logAction({
      action: 'ACCOUNT_TERMINATION',
      resourceType: 'AdminUser',
      resourceId: this._id,
      changes: { status: 'TERMINATED', reason: terminationData.reason },
      result: { success: true }
    });
    
    await this.save();
    
    logger.info(`Admin account ${this.administrativeId} terminated`);
    return this;
  } catch (error) {
    logger.error('Error terminating account:', error);
    throw error;
  }
};

adminUserSchema.methods.updateAccessControl = async function(accessControlData, updatedBy) {
  try {
    const updates = {};
    
    // Update IP whitelist
    if (accessControlData.ipWhitelist) {
      this.accessControl.ipWhitelist = accessControlData.ipWhitelist.map(ip => ({
        address: ip.address,
        description: ip.description,
        addedAt: new Date(),
        addedBy: updatedBy
      }));
      updates.ipWhitelist = accessControlData.ipWhitelist;
    }
    
    // Update access hours
    if (accessControlData.accessHours !== undefined) {
      this.accessControl.accessHours = accessControlData.accessHours;
      updates.accessHours = accessControlData.accessHours;
    }
    
    // Update geofencing
    if (accessControlData.geofencing !== undefined) {
      this.accessControl.geofencing = accessControlData.geofencing;
      updates.geofencing = accessControlData.geofencing;
    }
    
    // Update device restrictions
    if (accessControlData.deviceRestrictions !== undefined) {
      this.accessControl.deviceRestrictions = {
        ...this.accessControl.deviceRestrictions,
        ...accessControlData.deviceRestrictions
      };
      updates.deviceRestrictions = accessControlData.deviceRestrictions;
    }
    
    // Update MFA requirements
    if (accessControlData.mfaRequirements !== undefined) {
      this.accessControl.mfaRequirements = {
        ...this.accessControl.mfaRequirements,
        ...accessControlData.mfaRequirements
      };
      updates.mfaRequirements = accessControlData.mfaRequirements;
    }
    
    // Update session restrictions
    if (accessControlData.sessionRestrictions !== undefined) {
      this.accessControl.sessionRestrictions = {
        ...this.accessControl.sessionRestrictions,
        ...accessControlData.sessionRestrictions
      };
      updates.sessionRestrictions = accessControlData.sessionRestrictions;
    }
    
    // Log the update
    this.auditLog.modifications.push({
      modifiedBy: updatedBy,
      modifiedAt: new Date(),
      changes: new Map([['accessControl', updates]]),
      reason: 'Access control update'
    });
    
    await this.save();
    
    logger.info(`Access control updated for admin user ${this.administrativeId}`);
    return this;
  } catch (error) {
    logger.error('Error updating access control:', error);
    throw error;
  }
};

adminUserSchema.methods.updateGranularPermissions = async function(permissions, updatedBy) {
  try {
    const updates = {};
    
    Object.keys(permissions).forEach(category => {
      if (this.granularPermissions[category]) {
        Object.keys(permissions[category]).forEach(action => {
          if (this.granularPermissions[category][action] !== undefined) {
            this.granularPermissions[category][action] = permissions[category][action];
            
            if (!updates[category]) {
              updates[category] = {};
            }
            updates[category][action] = permissions[category][action];
          }
        });
      }
    });
    
    // Log the update
    this.auditLog.modifications.push({
      modifiedBy: updatedBy,
      modifiedAt: new Date(),
      changes: new Map([['granularPermissions', updates]]),
      reason: 'Granular permissions update'
    });
    
    await this.save();
    
    logger.info(`Granular permissions updated for admin user ${this.administrativeId}`);
    return this;
  } catch (error) {
    logger.error('Error updating granular permissions:', error);
    throw error;
  }
};

adminUserSchema.methods.addCertification = async function(certificationData) {
  try {
    this.administrativeMetadata.certifications.push({
      name: certificationData.name,
      issuer: certificationData.issuer,
      issueDate: certificationData.issueDate,
      expiryDate: certificationData.expiryDate,
      verificationUrl: certificationData.verificationUrl,
      certificateNumber: certificationData.certificateNumber,
      status: 'ACTIVE'
    });
    
    await this.save();
    
    logger.info(`Certification added for admin user ${this.administrativeId}`);
    return this;
  } catch (error) {
    logger.error('Error adding certification:', error);
    throw error;
  }
};

adminUserSchema.methods.addComplianceTraining = async function(trainingData) {
  try {
    this.administrativeMetadata.complianceTraining.push({
      trainingName: trainingData.name,
      completedDate: trainingData.completedDate || new Date(),
      expiryDate: trainingData.expiryDate,
      score: trainingData.score,
      certificateUrl: trainingData.certificateUrl,
      mandatory: trainingData.mandatory
    });
    
    await this.save();
    
    logger.info(`Compliance training added for admin user ${this.administrativeId}`);
    return this;
  } catch (error) {
    logger.error('Error adding compliance training:', error);
    throw error;
  }
};

adminUserSchema.methods.addAdministrativeNote = async function(noteData, addedBy) {
  try {
    this.administrativeMetadata.administrativeNotes.push({
      note: noteData.note,
      category: noteData.category || 'GENERAL',
      addedBy: addedBy,
      addedAt: new Date(),
      visibility: noteData.visibility || 'PRIVATE'
    });
    
    // Keep only last 500 notes
    if (this.administrativeMetadata.administrativeNotes.length > 500) {
      this.administrativeMetadata.administrativeNotes = 
        this.administrativeMetadata.administrativeNotes.slice(-500);
    }
    
    await this.save();
    
    logger.info(`Administrative note added for admin user ${this.administrativeId}`);
    return this;
  } catch (error) {
    logger.error('Error adding administrative note:', error);
    throw error;
  }
};

adminUserSchema.methods.checkAccessHours = function() {
  if (!this.accessControl.accessHours.enabled) {
    return true;
  }
  
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = now.toTimeString().substr(0, 5);
  
  const schedule = this.accessControl.accessHours.schedule.find(s => s.dayOfWeek === dayOfWeek);
  
  if (!schedule) {
    return false;
  }
  
  return currentTime >= schedule.startTime && currentTime <= schedule.endTime;
};

adminUserSchema.methods.checkGeofencing = function(location) {
  if (!this.accessControl.geofencing.enabled) {
    return true;
  }
  
  const { allowedCountries, blockedCountries } = this.accessControl.geofencing;
  
  if (blockedCountries?.includes(location.country)) {
    return false;
  }
  
  if (allowedCountries?.length > 0 && !allowedCountries.includes(location.country)) {
    return false;
  }
  
  return true;
};

adminUserSchema.methods.validateDevice = function(deviceId) {
  if (!this.accessControl.deviceRestrictions.enabled) {
    return true;
  }
  
  return this.accessControl.deviceRestrictions.registeredDevices.some(
    device => device.deviceId === deviceId && device.trusted
  );
};

adminUserSchema.methods.generateMFABackupCodes = async function() {
  try {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substr(2, 10).toUpperCase();
      codes.push({
        code: await HashService.hash(code),
        usedAt: null,
        generatedAt: new Date()
      });
    }
    
    this.accessControl.mfaRequirements.backupCodes = codes;
    await this.save();
    
    // Return unhashed codes for display to user
    return codes.map((_, index) => 
      Math.random().toString(36).substr(2, 10).toUpperCase()
    );
  } catch (error) {
    logger.error('Error generating MFA backup codes:', error);
    throw error;
  }
};

adminUserSchema.methods.useMFABackupCode = async function(code) {
  try {
    const backupCodeIndex = this.accessControl.mfaRequirements.backupCodes.findIndex(
      async (backupCode) => {
        return !backupCode.usedAt && await HashService.compare(code, backupCode.code);
      }
    );
    
    if (backupCodeIndex < 0) {
      return false;
    }
    
    this.accessControl.mfaRequirements.backupCodes[backupCodeIndex].usedAt = new Date();
    await this.save();
    
    return true;
  } catch (error) {
    logger.error('Error using MFA backup code:', error);
    throw error;
  }
};

adminUserSchema.methods.toSafeJSON = function() {
  const obj = this.toObject();
  
  // Remove sensitive fields
  delete obj.accessControl.mfaRequirements.backupCodes;
  delete obj.auditLog.accessLog;
  delete obj.activityTracking.loginHistory;
  
  return obj;
};

// ==================== Static Methods ====================
adminUserSchema.statics.findByAdministrativeId = async function(administrativeId) {
  return this.findOne({ administrativeId });
};

adminUserSchema.statics.findByUserId = async function(userId) {
  return this.findOne({ userId });
};

adminUserSchema.statics.findByDepartment = async function(department, options = {}) {
  const query = { 'adminProfile.department': department };
  
  if (options.activeOnly) {
    query['status.accountStatus'] = 'ACTIVE';
  }
  
  return this.find(query);
};

adminUserSchema.statics.findByRole = async function(roleName, options = {}) {
  const query = { 'administrativeRoles.roleName': roleName };
  
  if (options.activeOnly) {
    query['status.accountStatus'] = 'ACTIVE';
  }
  
  if (options.nonExpired) {
    query.$or = [
      { 'administrativeRoles.expiresAt': null },
      { 'administrativeRoles.expiresAt': { $gt: new Date() } }
    ];
  }
  
  return this.find(query);
};

adminUserSchema.statics.findActiveAdmins = async function(options = {}) {
  const query = {
    'status.accountStatus': 'ACTIVE',
    'status.suspensionDetails.suspended': false,
    'status.terminationDetails.terminated': false,
    'status.lockoutDetails.isLocked': false
  };
  
  if (options.department) {
    query['adminProfile.department'] = options.department;
  }
  
  if (options.role) {
    query['administrativeRoles.roleName'] = options.role;
  }
  
  return this.find(query);
};

adminUserSchema.statics.findSuspendedAccounts = async function() {
  return this.find({
    'status.accountStatus': 'SUSPENDED',
    'status.suspensionDetails.suspended': true
  });
};

adminUserSchema.statics.findAccountsForReactivation = async function() {
  return this.find({
    'status.accountStatus': 'SUSPENDED',
    'status.suspensionDetails.autoReactivateAt': { $lte: new Date() }
  });
};

adminUserSchema.statics.findExpiringRoles = async function(daysAhead = 7) {
  const expiryDate = new Date(Date.now() + (daysAhead * 24 * 60 * 60 * 1000));
  
  return this.find({
    'administrativeRoles.expiresAt': { $lte: expiryDate, $gt: new Date() }
  });
};

adminUserSchema.statics.findInactiveAccounts = async function(daysInactive = 30) {
  const inactiveDate = new Date(Date.now() - (daysInactive * 24 * 60 * 60 * 1000));
  
  return this.find({
    'activityTracking.lastLogin.timestamp': { $lt: inactiveDate }
  });
};

adminUserSchema.statics.performComplianceAudit = async function(complianceType) {
  const admins = await this.find({ 'status.accountStatus': 'ACTIVE' });
  const auditResults = [];
  
  for (const admin of admins) {
    const result = {
      adminId: admin._id,
      administrativeId: admin.administrativeId,
      complianceType,
      performedAt: new Date(),
      findings: [],
      passed: true
    };
    
    // Check required certifications
    const requiredCerts = ['ISO_27001', 'GDPR_COMPLIANCE'];
    for (const cert of requiredCerts) {
      const hasCert = admin.administrativeMetadata.certifications.some(
        c => c.name === cert && c.status === 'ACTIVE'
      );
      
      if (!hasCert) {
        result.findings.push(`Missing required certification: ${cert}`);
        result.passed = false;
      }
    }
    
    // Check training compliance
    const requiredTraining = ['SECURITY_AWARENESS', 'DATA_PROTECTION'];
    for (const training of requiredTraining) {
      const hasTraining = admin.administrativeMetadata.complianceTraining.some(
        t => t.trainingName === training && 
             (!t.expiryDate || t.expiryDate > new Date())
      );
      
      if (!hasTraining) {
        result.findings.push(`Missing or expired training: ${training}`);
        result.passed = false;
      }
    }
    
    // Check MFA enforcement
    if (!admin.accessControl.mfaRequirements.enforced) {
      result.findings.push('MFA not enforced');
      result.passed = false;
    }
    
    auditResults.push(result);
  }
  
  return auditResults;
};

// ==================== Model Registration ====================
const AdminUserModel = BaseModel.model('AdminUser', adminUserSchema);

module.exports = AdminUserModel;