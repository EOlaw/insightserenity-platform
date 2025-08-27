'use strict';

/**
 * @fileoverview User permission model for granular access control management
 * @module servers/admin-server/modules/user-management/models/user-permission-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/permissions
 * @requires module:shared/lib/utils/constants/roles
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');
const dateHelper = require('../../../../../utils/helpers/date-helper');
const { PERMISSIONS } = require('../../../../../utils/constants/permissions');
const { ROLES } = require('../../../../../utils/constants/roles');

/**
 * User permission schema for fine-grained access control
 */
const userPermissionSchema = new mongoose.Schema({
  // ==================== Core Permission Identity ====================
  permissionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `PERM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique permission identifier'
  },
  
  permissionCode: {
    type: String,
    required: true,
    unique: true,
    index: true,
    uppercase: true,
    validate: {
      validator: function(v) {
        return /^[A-Z][A-Z0-9_]{2,49}$/.test(v);
      },
      message: 'Permission code must be uppercase alphanumeric with underscores, starting with a letter'
    },
    description: 'System permission code'
  },
  
  permissionName: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 100,
    description: 'Human-readable permission name'
  },
  
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
    description: 'Detailed permission description'
  },
  
  // ==================== Permission Categorization ====================
  category: {
    type: String,
    required: true,
    enum: [
      'USER_MANAGEMENT',
      'ORGANIZATION_MANAGEMENT',
      'SYSTEM_ADMINISTRATION',
      'SECURITY_ADMINISTRATION',
      'BILLING_ADMINISTRATION',
      'SUPPORT_ADMINISTRATION',
      'ANALYTICS_ADMINISTRATION',
      'CONTENT_MANAGEMENT',
      'API_ACCESS',
      'INTEGRATION_MANAGEMENT'
    ],
    index: true,
    description: 'Permission category for grouping'
  },
  
  subcategory: {
    type: String,
    trim: true,
    description: 'Optional subcategory for further organization'
  },
  
  module: {
    type: String,
    required: true,
    trim: true,
    description: 'Module this permission belongs to'
  },
  
  resource: {
    type: String,
    required: true,
    trim: true,
    description: 'Resource this permission applies to'
  },
  
  action: {
    type: String,
    required: true,
    enum: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE', 'APPROVE', 'EXPORT', 'IMPORT', 'MANAGE', 'VIEW', 'MODIFY'],
    description: 'Action type for this permission'
  },
  
  // ==================== Permission Configuration ====================
  configuration: {
    scope: {
      type: String,
      enum: ['GLOBAL', 'ORGANIZATION', 'DEPARTMENT', 'TEAM', 'PROJECT', 'PERSONAL'],
      default: 'ORGANIZATION',
      description: 'Scope level of the permission'
    },
    
    dataAccess: {
      type: String,
      enum: ['ALL', 'OWNED', 'TEAM', 'DEPARTMENT', 'ASSIGNED', 'PUBLIC'],
      default: 'OWNED',
      description: 'Data access level for this permission'
    },
    
    requiresApproval: {
      type: Boolean,
      default: false,
      description: 'Whether actions require approval'
    },
    
    approvalLevels: {
      type: Number,
      default: 1,
      min: 1,
      max: 5,
      description: 'Number of approval levels required'
    },
    
    timeRestricted: {
      type: Boolean,
      default: false,
      description: 'Whether permission has time restrictions'
    },
    
    timeRestrictions: {
      startTime: String,
      endTime: String,
      daysOfWeek: [{
        type: Number,
        min: 0,
        max: 6
      }],
      timezone: {
        type: String,
        default: 'UTC'
      }
    },
    
    locationRestricted: {
      type: Boolean,
      default: false,
      description: 'Whether permission has location restrictions'
    },
    
    locationRestrictions: {
      allowedCountries: [{
        type: String,
        uppercase: true,
        minlength: 2,
        maxlength: 2
      }],
      allowedRegions: [String],
      allowedOffices: [String],
      allowedIpRanges: [{
        startIp: String,
        endIp: String,
        description: String
      }]
    },
    
    resourceLimits: {
      maxRecordsPerQuery: {
        type: Number,
        default: 1000,
        min: 1
      },
      maxQueriesPerHour: {
        type: Number,
        default: 100,
        min: 1
      },
      maxExportsPerDay: {
        type: Number,
        default: 10,
        min: 1
      },
      maxConcurrentOperations: {
        type: Number,
        default: 5,
        min: 1
      }
    },
    
    sensitivityLevel: {
      type: String,
      enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'TOP_SECRET'],
      default: 'INTERNAL',
      description: 'Data sensitivity level'
    },
    
    riskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'LOW',
      description: 'Risk level associated with this permission'
    }
  },
  
  // ==================== Permission Dependencies ====================
  dependencies: {
    requiredPermissions: [{
      permissionCode: {
        type: String,
        required: true
      },
      reason: String,
      mandatory: {
        type: Boolean,
        default: true
      }
    }],
    
    conflictingPermissions: [{
      permissionCode: {
        type: String,
        required: true
      },
      reason: String,
      severity: {
        type: String,
        enum: ['WARNING', 'ERROR'],
        default: 'ERROR'
      }
    }],
    
    parentPermission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserPermission',
      index: true,
      description: 'Parent permission if hierarchical'
    },
    
    childPermissions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserPermission',
      description: 'Child permissions in hierarchy'
    }],
    
    impliedPermissions: [{
      permissionCode: String,
      reason: String
    }],
    
    prerequisiteRoles: [{
      type: String,
      enum: Object.values(ROLES.ADMIN),
      description: 'Roles that must be held to have this permission'
    }]
  },
  
  // ==================== Permission Assignment Rules ====================
  assignmentRules: {
    autoAssign: {
      type: Boolean,
      default: false,
      description: 'Automatically assign to new users'
    },
    
    autoAssignConditions: [{
      field: String,
      operator: {
        type: String,
        enum: ['equals', 'notEquals', 'contains', 'startsWith', 'endsWith', 'in', 'notIn']
      },
      value: mongoose.Schema.Types.Mixed,
      joinOperator: {
        type: String,
        enum: ['AND', 'OR'],
        default: 'AND'
      }
    }],
    
    eligibilityCriteria: {
      minimumTenure: {
        type: Number,
        default: 0,
        description: 'Minimum days of tenure required'
      },
      requiredTraining: [{
        trainingName: String,
        validityPeriod: Number // Days
      }],
      requiredCertifications: [{
        certificationName: String,
        issuer: String,
        mustBeActive: {
          type: Boolean,
          default: true
        }
      }],
      departmentRestrictions: [{
        type: String,
        enum: ['EXECUTIVE', 'OPERATIONS', 'TECHNICAL', 'SUPPORT', 'SECURITY', 'COMPLIANCE', 'FINANCE', 'HUMAN_RESOURCES']
      }],
      levelRestrictions: {
        minLevel: Number,
        maxLevel: Number
      }
    },
    
    assignmentWorkflow: {
      requiresJustification: {
        type: Boolean,
        default: false
      },
      requiresManagerApproval: {
        type: Boolean,
        default: false
      },
      requiresSecurityReview: {
        type: Boolean,
        default: false
      },
      requiresComplianceReview: {
        type: Boolean,
        default: false
      },
      approvalChain: [{
        approverRole: String,
        approvalOrder: Number,
        escalationTime: Number, // Hours
        optional: {
          type: Boolean,
          default: false
        }
      }],
      maxAssignmentDuration: {
        type: Number,
        description: 'Maximum duration in days'
      },
      renewalAllowed: {
        type: Boolean,
        default: true
      },
      renewalProcess: {
        type: String,
        enum: ['AUTOMATIC', 'MANUAL', 'REVIEW_REQUIRED'],
        default: 'MANUAL'
      }
    },
    
    revocationRules: {
      autoRevoke: {
        type: Boolean,
        default: false
      },
      autoRevokeConditions: [{
        trigger: {
          type: String,
          enum: ['ROLE_CHANGE', 'DEPARTMENT_CHANGE', 'SUSPENSION', 'TERMINATION', 'INACTIVITY', 'COMPLIANCE_FAILURE']
        },
        action: {
          type: String,
          enum: ['IMMEDIATE', 'SCHEDULED', 'AFTER_REVIEW'],
          default: 'IMMEDIATE'
        },
        gracePeriod: Number // Hours
      }],
      requiresJustification: {
        type: Boolean,
        default: true
      },
      notificationRequired: {
        type: Boolean,
        default: true
      }
    }
  },
  
  // ==================== Permission Usage Tracking ====================
  usageTracking: {
    totalAssignments: {
      type: Number,
      default: 0,
      min: 0,
      description: 'Total number of users assigned this permission'
    },
    
    activeAssignments: {
      type: Number,
      default: 0,
      min: 0,
      description: 'Current active assignments'
    },
    
    usageStatistics: {
      lastUsed: Date,
      totalUsageCount: {
        type: Number,
        default: 0
      },
      dailyUsageCount: {
        type: Number,
        default: 0
      },
      weeklyUsageCount: {
        type: Number,
        default: 0
      },
      monthlyUsageCount: {
        type: Number,
        default: 0
      },
      averageUsagePerUser: {
        type: Number,
        default: 0
      }
    },
    
    performanceMetrics: {
      averageExecutionTime: Number,
      successRate: {
        type: Number,
        min: 0,
        max: 100
      },
      errorRate: {
        type: Number,
        min: 0,
        max: 100
      },
      lastError: {
        timestamp: Date,
        errorMessage: String,
        userId: mongoose.Schema.Types.ObjectId
      }
    },
    
    assignments: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      assignedAt: {
        type: Date,
        default: Date.now
      },
      assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      expiresAt: Date,
      scope: {
        type: String,
        enum: ['GLOBAL', 'ORGANIZATION', 'DEPARTMENT', 'TEAM', 'PROJECT'],
        default: 'ORGANIZATION'
      },
      restrictions: [String],
      usageCount: {
        type: Number,
        default: 0
      },
      lastUsed: Date
    }],
    
    revocations: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      revokedAt: {
        type: Date,
        default: Date.now
      },
      revokedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      reason: String,
      wasAutoRevoked: {
        type: Boolean,
        default: false
      }
    }]
  },
  
  // ==================== Permission Audit & Compliance ====================
  auditConfiguration: {
    auditingEnabled: {
      type: Boolean,
      default: true,
      description: 'Enable audit logging for this permission'
    },
    
    auditLevel: {
      type: String,
      enum: ['NONE', 'BASIC', 'DETAILED', 'FULL'],
      default: 'BASIC',
      description: 'Level of audit detail'
    },
    
    retentionPeriod: {
      type: Number,
      default: 365,
      min: 30,
      description: 'Audit log retention in days'
    },
    
    alertOnMisuse: {
      type: Boolean,
      default: false,
      description: 'Alert on potential permission misuse'
    },
    
    misuseThresholds: {
      maxUsagePerHour: Number,
      maxUsagePerDay: Number,
      maxFailedAttempts: {
        type: Number,
        default: 5
      },
      unusualAccessPatterns: {
        type: Boolean,
        default: false
      }
    },
    
    complianceRequirements: [{
      standard: {
        type: String,
        enum: ['GDPR', 'HIPAA', 'SOX', 'PCI_DSS', 'ISO_27001', 'CCPA', 'FedRAMP']
      },
      requirement: String,
      controls: [String],
      validationFrequency: {
        type: String,
        enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'],
        default: 'MONTHLY'
      }
    }],
    
    regulatoryFlags: {
      piiAccess: {
        type: Boolean,
        default: false,
        description: 'Permission grants access to PII'
      },
      financialData: {
        type: Boolean,
        default: false,
        description: 'Permission grants access to financial data'
      },
      healthData: {
        type: Boolean,
        default: false,
        description: 'Permission grants access to health data'
      },
      exportControlled: {
        type: Boolean,
        default: false,
        description: 'Subject to export control regulations'
      }
    }
  },
  
  // ==================== Permission Metadata ====================
  metadata: {
    version: {
      type: String,
      default: '1.0.0',
      description: 'Permission version'
    },
    
    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    
    customAttributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      description: 'Custom attributes for extensibility'
    },
    
    documentation: {
      usageGuide: String,
      examples: [String],
      bestPractices: [String],
      warnings: [String],
      relatedLinks: [{
        title: String,
        url: String,
        description: String
      }]
    },
    
    apiEndpoints: [{
      method: {
        type: String,
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
      },
      path: String,
      description: String,
      parameters: [{
        name: String,
        type: String,
        required: Boolean,
        description: String
      }]
    }],
    
    uiComponents: [{
      componentId: String,
      componentName: String,
      componentType: {
        type: String,
        enum: ['MENU', 'BUTTON', 'PAGE', 'SECTION', 'WIDGET', 'MODAL']
      },
      visible: {
        type: Boolean,
        default: true
      },
      enabled: {
        type: Boolean,
        default: true
      }
    }],
    
    businessRules: [{
      ruleId: String,
      ruleName: String,
      condition: String,
      action: String,
      priority: Number
    }],
    
    costAllocation: {
      costCenter: String,
      monthlyCost: Number,
      billingModel: {
        type: String,
        enum: ['PER_USER', 'PER_USAGE', 'FLAT_RATE', 'TIERED'],
        default: 'PER_USER'
      }
    },
    
    lifecycle: {
      status: {
        type: String,
        enum: ['DRAFT', 'ACTIVE', 'DEPRECATED', 'RETIRED'],
        default: 'ACTIVE',
        required: true
      },
      effectiveDate: Date,
      expirationDate: Date,
      deprecationDate: Date,
      replacedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserPermission'
      },
      migrationPath: String
    }
  },
  
  // ==================== Status & Control ====================
  status: {
    isActive: {
      type: Boolean,
      default: true,
      required: true,
      index: true
    },
    
    isSystem: {
      type: Boolean,
      default: false,
      description: 'System permission that cannot be deleted'
    },
    
    isCustom: {
      type: Boolean,
      default: false,
      description: 'Custom permission created by organization'
    },
    
    isInheritable: {
      type: Boolean,
      default: true,
      description: 'Can be inherited by child entities'
    },
    
    isDelegatable: {
      type: Boolean,
      default: false,
      description: 'Can be delegated to other users'
    },
    
    isTransferable: {
      type: Boolean,
      default: false,
      description: 'Can be transferred between users'
    },
    
    maintenanceMode: {
      enabled: {
        type: Boolean,
        default: false
      },
      reason: String,
      startedAt: Date,
      expectedEndTime: Date,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }
    }
  },
  
  // ==================== Audit Trail ====================
  auditLog: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: true
    },
    
    createdAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },
    
    lastModifiedAt: Date,
    
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
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      }
    }],
    
    reviews: [{
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
      },
      reviewedAt: {
        type: Date,
        default: Date.now
      },
      reviewType: {
        type: String,
        enum: ['SECURITY', 'COMPLIANCE', 'PERIODIC', 'AUDIT', 'INCIDENT']
      },
      findings: [String],
      recommendations: [String],
      approved: Boolean,
      nextReviewDate: Date
    }]
  }
}, {
  timestamps: true,
  collection: 'user_permissions',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes for Performance ====================
userPermissionSchema.index({ permissionCode: 1, 'status.isActive': 1 });
userPermissionSchema.index({ category: 1, module: 1, resource: 1, action: 1 });
userPermissionSchema.index({ 'configuration.scope': 1, 'configuration.sensitivityLevel': 1 });
userPermissionSchema.index({ 'usageTracking.activeAssignments': -1 });
userPermissionSchema.index({ 'metadata.lifecycle.status': 1 });
userPermissionSchema.index({ 'dependencies.parentPermission': 1 });
userPermissionSchema.index({ 'assignmentRules.eligibilityCriteria.departmentRestrictions': 1 });

// ==================== Virtual Properties ====================
userPermissionSchema.virtual('fullPermissionPath').get(function() {
  return `${this.category}.${this.module}.${this.resource}.${this.action}`;
});

userPermissionSchema.virtual('isHighRisk').get(function() {
  return this.configuration.riskLevel === 'HIGH' || 
         this.configuration.riskLevel === 'CRITICAL' ||
         this.configuration.sensitivityLevel === 'RESTRICTED' ||
         this.configuration.sensitivityLevel === 'TOP_SECRET';
});

userPermissionSchema.virtual('requiresSpecialApproval').get(function() {
  return this.configuration.requiresApproval && 
         this.configuration.approvalLevels > 1;
});

userPermissionSchema.virtual('hasComplianceRequirements').get(function() {
  return this.auditConfiguration.complianceRequirements && 
         this.auditConfiguration.complianceRequirements.length > 0;
});

// ==================== Pre-Save Middleware ====================
userPermissionSchema.pre('save', async function(next) {
  try {
    // Generate permission code if not provided
    if (this.isNew && !this.permissionCode) {
      this.permissionCode = this.generatePermissionCode();
    }
    
    // Validate dependencies
    if (this.isModified('dependencies')) {
      await this.validateDependencies();
    }
    
    // Update usage statistics
    if (this.isModified('usageTracking.assignments')) {
      this.updateUsageStatistics();
    }
    
    // Check for conflicts
    if (this.dependencies?.conflictingPermissions?.length > 0) {
      await this.checkForConflicts();
    }
    
    // Validate assignment rules
    if (this.isModified('assignmentRules')) {
      this.validateAssignmentRules();
    }
    
    // Set lifecycle dates
    if (this.isNew && this.metadata?.lifecycle) {
      if (!this.metadata.lifecycle.effectiveDate) {
        this.metadata.lifecycle.effectiveDate = new Date();
      }
    }
    
    next();
  } catch (error) {
    logger.error('Pre-save error in UserPermission model:', error);
    next(error);
  }
});

// ==================== Instance Methods ====================
userPermissionSchema.methods.generatePermissionCode = function() {
  const prefix = this.category.substring(0, 3);
  const action = this.action.substring(0, 3);
  const random = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `${prefix}_${action}_${random}`;
};

userPermissionSchema.methods.validateDependencies = async function() {
  const Permission = this.constructor;
  
  // Check required permissions exist
  if (this.dependencies?.requiredPermissions?.length > 0) {
    for (const req of this.dependencies.requiredPermissions) {
      const exists = await Permission.findOne({ 
        permissionCode: req.permissionCode,
        'status.isActive': true 
      });
      
      if (!exists && req.mandatory) {
        throw new AppError(`Required permission ${req.permissionCode} does not exist`, 400);
      }
    }
  }
  
  // Check for circular dependencies
  if (this.dependencies?.parentPermission) {
    const parent = await Permission.findById(this.dependencies.parentPermission);
    if (parent && parent.dependencies?.parentPermission?.equals(this._id)) {
      throw new AppError('Circular dependency detected', 400);
    }
  }
  
  return true;
};

userPermissionSchema.methods.checkForConflicts = async function() {
  const conflicts = [];
  
  for (const conflict of this.dependencies.conflictingPermissions) {
    if (conflict.severity === 'ERROR') {
      conflicts.push(conflict.permissionCode);
    }
  }
  
  if (conflicts.length > 0) {
    logger.warn(`Permission ${this.permissionCode} has conflicts with: ${conflicts.join(', ')}`);
  }
  
  return conflicts;
};

userPermissionSchema.methods.validateAssignmentRules = function() {
  const rules = this.assignmentRules;
  
  // Validate auto-assign conditions
  if (rules?.autoAssign && (!rules.autoAssignConditions || rules.autoAssignConditions.length === 0)) {
    throw new AppError('Auto-assign enabled but no conditions specified', 400);
  }
  
  // Validate approval chain
  if (rules?.assignmentWorkflow?.approvalChain?.length > 0) {
    const orders = rules.assignmentWorkflow.approvalChain.map(a => a.approvalOrder);
    const uniqueOrders = [...new Set(orders)];
    
    if (orders.length !== uniqueOrders.length) {
      throw new AppError('Duplicate approval orders in chain', 400);
    }
  }
  
  // Validate eligibility criteria
  if (rules?.eligibilityCriteria?.levelRestrictions) {
    const { minLevel, maxLevel } = rules.eligibilityCriteria.levelRestrictions;
    
    if (minLevel && maxLevel && minLevel > maxLevel) {
      throw new AppError('Minimum level cannot be greater than maximum level', 400);
    }
  }
  
  return true;
};

userPermissionSchema.methods.updateUsageStatistics = function() {
  const assignments = this.usageTracking.assignments || [];
  const activeAssignments = assignments.filter(a => !a.expiresAt || a.expiresAt > new Date());
  
  this.usageTracking.totalAssignments = assignments.length;
  this.usageTracking.activeAssignments = activeAssignments.length;
  
  // Calculate average usage
  const totalUsage = assignments.reduce((sum, a) => sum + (a.usageCount || 0), 0);
  this.usageTracking.usageStatistics.averageUsagePerUser = 
    assignments.length > 0 ? Math.round(totalUsage / assignments.length) : 0;
};

userPermissionSchema.methods.assignToUser = async function(userId, assignmentData) {
  try {
    // Check if already assigned
    const existingAssignment = this.usageTracking.assignments.find(
      a => a.userId.equals(userId) && (!a.expiresAt || a.expiresAt > new Date())
    );
    
    if (existingAssignment) {
      throw new AppError('Permission already assigned to user', 400);
    }
    
    // Check eligibility
    await this.checkUserEligibility(userId);
    
    // Add assignment
    const assignment = {
      userId,
      assignedAt: new Date(),
      assignedBy: assignmentData.assignedBy,
      expiresAt: assignmentData.expiresAt,
      scope: assignmentData.scope || this.configuration.scope,
      restrictions: assignmentData.restrictions || [],
      usageCount: 0,
      lastUsed: null
    };
    
    this.usageTracking.assignments.push(assignment);
    this.updateUsageStatistics();
    
    await this.save();
    
    logger.info(`Permission ${this.permissionCode} assigned to user ${userId}`);
    return assignment;
  } catch (error) {
    logger.error('Error assigning permission to user:', error);
    throw error;
  }
};

userPermissionSchema.methods.revokeFromUser = async function(userId, revocationData) {
  try {
    const assignmentIndex = this.usageTracking.assignments.findIndex(
      a => a.userId.equals(userId) && (!a.expiresAt || a.expiresAt > new Date())
    );
    
    if (assignmentIndex < 0) {
      throw new AppError('Permission not assigned to user', 404);
    }
    
    // Remove assignment
    const removedAssignment = this.usageTracking.assignments.splice(assignmentIndex, 1)[0];
    
    // Add to revocations
    this.usageTracking.revocations.push({
      userId,
      revokedAt: new Date(),
      revokedBy: revocationData.revokedBy,
      reason: revocationData.reason,
      wasAutoRevoked: revocationData.wasAutoRevoked || false
    });
    
    this.updateUsageStatistics();
    
    await this.save();
    
    logger.info(`Permission ${this.permissionCode} revoked from user ${userId}`);
    return removedAssignment;
  } catch (error) {
    logger.error('Error revoking permission from user:', error);
    throw error;
  }
};

userPermissionSchema.methods.checkUserEligibility = async function(userId) {
  // This would typically check against user data
  // For now, we'll implement basic validation
  const criteria = this.assignmentRules?.eligibilityCriteria;
  
  if (!criteria) {
    return true;
  }
  
  // Check department restrictions
  if (criteria.departmentRestrictions?.length > 0) {
    // Would need to fetch user and check department
    logger.debug('Checking department restrictions for user:', userId);
  }
  
  // Check required training
  if (criteria.requiredTraining?.length > 0) {
    // Would need to check user's training records
    logger.debug('Checking training requirements for user:', userId);
  }
  
  // Check required certifications
  if (criteria.requiredCertifications?.length > 0) {
    // Would need to check user's certifications
    logger.debug('Checking certification requirements for user:', userId);
  }
  
  return true;
};

userPermissionSchema.methods.recordUsage = async function(userId, usageData) {
  try {
    const assignment = this.usageTracking.assignments.find(
      a => a.userId.equals(userId) && (!a.expiresAt || a.expiresAt > new Date())
    );
    
    if (!assignment) {
      throw new AppError('Permission not assigned to user', 403);
    }
    
    // Update assignment usage
    assignment.usageCount += 1;
    assignment.lastUsed = new Date();
    
    // Update overall statistics
    this.usageTracking.usageStatistics.totalUsageCount += 1;
    this.usageTracking.usageStatistics.dailyUsageCount += 1;
    this.usageTracking.usageStatistics.lastUsed = new Date();
    
    // Update performance metrics if provided
    if (usageData.executionTime) {
      const currentAvg = this.usageTracking.performanceMetrics.averageExecutionTime || 0;
      const totalCount = this.usageTracking.usageStatistics.totalUsageCount;
      this.usageTracking.performanceMetrics.averageExecutionTime = 
        ((currentAvg * (totalCount - 1)) + usageData.executionTime) / totalCount;
    }
    
    if (usageData.success !== undefined) {
      const successCount = usageData.success ? 1 : 0;
      const currentRate = this.usageTracking.performanceMetrics.successRate || 0;
      const totalCount = this.usageTracking.usageStatistics.totalUsageCount;
      this.usageTracking.performanceMetrics.successRate = 
        ((currentRate * (totalCount - 1)) + (successCount * 100)) / totalCount;
      
      if (!usageData.success) {
        this.usageTracking.performanceMetrics.lastError = {
          timestamp: new Date(),
          errorMessage: usageData.errorMessage,
          userId
        };
      }
    }
    
    await this.save();
    
    return assignment;
  } catch (error) {
    logger.error('Error recording permission usage:', error);
    throw error;
  }
};

userPermissionSchema.methods.checkTimeRestrictions = function() {
  if (!this.configuration.timeRestricted) {
    return true;
  }
  
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = now.toTimeString().substr(0, 5);
  const restrictions = this.configuration.timeRestrictions;
  
  // Check day of week
  if (restrictions.daysOfWeek && !restrictions.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }
  
  // Check time range
  if (restrictions.startTime && restrictions.endTime) {
    return currentTime >= restrictions.startTime && currentTime <= restrictions.endTime;
  }
  
  return true;
};

userPermissionSchema.methods.checkLocationRestrictions = function(location) {
  if (!this.configuration.locationRestricted) {
    return true;
  }
  
  const restrictions = this.configuration.locationRestrictions;
  
  // Check country restrictions
  if (restrictions.allowedCountries?.length > 0) {
    if (!restrictions.allowedCountries.includes(location.country)) {
      return false;
    }
  }
  
  // Check IP range restrictions
  if (restrictions.allowedIpRanges?.length > 0) {
    // Would need IP range checking logic
    logger.debug('Checking IP range restrictions');
  }
  
  return true;
};

userPermissionSchema.methods.isExpired = function() {
  if (this.metadata?.lifecycle?.expirationDate) {
    return new Date() > this.metadata.lifecycle.expirationDate;
  }
  return false;
};

userPermissionSchema.methods.isDeprecated = function() {
  return this.metadata?.lifecycle?.status === 'DEPRECATED';
};

userPermissionSchema.methods.deprecate = async function(replacementPermissionId, deprecationData) {
  try {
    this.metadata.lifecycle.status = 'DEPRECATED';
    this.metadata.lifecycle.deprecationDate = new Date();
    
    if (replacementPermissionId) {
      this.metadata.lifecycle.replacedBy = replacementPermissionId;
    }
    
    if (deprecationData?.migrationPath) {
      this.metadata.lifecycle.migrationPath = deprecationData.migrationPath;
    }
    
    await this.save();
    
    logger.info(`Permission ${this.permissionCode} deprecated`);
    return this;
  } catch (error) {
    logger.error('Error deprecating permission:', error);
    throw error;
  }
};

userPermissionSchema.methods.retire = async function() {
  try {
    if (this.status.isSystem) {
      throw new AppError('Cannot retire system permission', 403);
    }
    
    this.metadata.lifecycle.status = 'RETIRED';
    this.status.isActive = false;
    
    // Revoke all active assignments
    const activeAssignments = this.usageTracking.assignments.filter(
      a => !a.expiresAt || a.expiresAt > new Date()
    );
    
    for (const assignment of activeAssignments) {
      await this.revokeFromUser(assignment.userId, {
        reason: 'Permission retired',
        wasAutoRevoked: true
      });
    }
    
    await this.save();
    
    logger.info(`Permission ${this.permissionCode} retired`);
    return this;
  } catch (error) {
    logger.error('Error retiring permission:', error);
    throw error;
  }
};

userPermissionSchema.methods.clone = async function(overrides = {}) {
  try {
    const Permission = this.constructor;
    
    const clonedData = this.toObject();
    delete clonedData._id;
    delete clonedData.permissionId;
    delete clonedData.permissionCode;
    delete clonedData.createdAt;
    delete clonedData.updatedAt;
    delete clonedData.__v;
    
    // Reset usage tracking
    clonedData.usageTracking = {
      totalAssignments: 0,
      activeAssignments: 0,
      assignments: [],
      revocations: []
    };
    
    // Apply overrides
    Object.assign(clonedData, overrides);
    
    // Mark as custom
    clonedData.status.isCustom = true;
    clonedData.status.isSystem = false;
    
    const clonedPermission = new Permission(clonedData);
    await clonedPermission.save();
    
    logger.info(`Permission ${this.permissionCode} cloned as ${clonedPermission.permissionCode}`);
    return clonedPermission;
  } catch (error) {
    logger.error('Error cloning permission:', error);
    throw error;
  }
};

userPermissionSchema.methods.toSafeJSON = function() {
  const obj = this.toObject();
  
  // Remove sensitive audit information
  delete obj.auditLog.modifications;
  delete obj.usageTracking.assignments;
  delete obj.usageTracking.revocations;
  
  return obj;
};

// ==================== Static Methods ====================
userPermissionSchema.statics.findByCode = async function(permissionCode) {
  return this.findOne({ permissionCode, 'status.isActive': true });
};

userPermissionSchema.statics.findByCategory = async function(category, options = {}) {
  const query = { category };
  
  if (options.activeOnly !== false) {
    query['status.isActive'] = true;
  }
  
  if (options.includeDeprecated !== true) {
    query['metadata.lifecycle.status'] = { $ne: 'DEPRECATED' };
  }
  
  return this.find(query);
};

userPermissionSchema.statics.findByModule = async function(module) {
  return this.find({ 
    module,
    'status.isActive': true,
    'metadata.lifecycle.status': { $in: ['ACTIVE', 'DEPRECATED'] }
  });
};

userPermissionSchema.statics.findByResource = async function(resource, action) {
  const query = { 
    resource,
    'status.isActive': true 
  };
  
  if (action) {
    query.action = action;
  }
  
  return this.find(query);
};

userPermissionSchema.statics.findSystemPermissions = async function() {
  return this.find({ 
    'status.isSystem': true,
    'status.isActive': true 
  });
};

userPermissionSchema.statics.findCustomPermissions = async function(organizationId) {
  const query = { 
    'status.isCustom': true,
    'status.isActive': true 
  };
  
  if (organizationId) {
    query['metadata.customAttributes.organizationId'] = organizationId;
  }
  
  return this.find(query);
};

userPermissionSchema.statics.findHighRiskPermissions = async function() {
  return this.find({
    'status.isActive': true,
    $or: [
      { 'configuration.riskLevel': { $in: ['HIGH', 'CRITICAL'] } },
      { 'configuration.sensitivityLevel': { $in: ['RESTRICTED', 'TOP_SECRET'] } }
    ]
  });
};

userPermissionSchema.statics.findUnusedPermissions = async function(days = 90) {
  const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  
  return this.find({
    'status.isActive': true,
    $or: [
      { 'usageTracking.usageStatistics.lastUsed': { $lt: cutoffDate } },
      { 'usageTracking.usageStatistics.lastUsed': null }
    ]
  });
};

userPermissionSchema.statics.findExpiredAssignments = async function() {
  return this.aggregate([
    {
      $match: {
        'status.isActive': true,
        'usageTracking.assignments.expiresAt': { $lte: new Date() }
      }
    },
    {
      $project: {
        permissionCode: 1,
        expiredAssignments: {
          $filter: {
            input: '$usageTracking.assignments',
            as: 'assignment',
            cond: {
              $and: [
                { $lte: ['$$assignment.expiresAt', new Date()] },
                { $ne: ['$$assignment.expiresAt', null] }
              ]
            }
          }
        }
      }
    },
    {
      $match: {
        'expiredAssignments.0': { $exists: true }
      }
    }
  ]);
};

userPermissionSchema.statics.generatePermissionMatrix = async function(userId) {
  const permissions = await this.find({
    'status.isActive': true,
    'usageTracking.assignments.userId': userId,
    'usageTracking.assignments.expiresAt': { $gt: new Date() }
  });
  
  const matrix = {};
  
  for (const permission of permissions) {
    const assignment = permission.usageTracking.assignments.find(
      a => a.userId.equals(userId) && (!a.expiresAt || a.expiresAt > new Date())
    );
    
    if (assignment) {
      const key = `${permission.category}.${permission.module}`;
      
      if (!matrix[key]) {
        matrix[key] = {};
      }
      
      matrix[key][permission.resource] = matrix[key][permission.resource] || [];
      matrix[key][permission.resource].push({
        action: permission.action,
        scope: assignment.scope,
        restrictions: assignment.restrictions,
        expiresAt: assignment.expiresAt
      });
    }
  }
  
  return matrix;
};

// ==================== Model Registration ====================
const UserPermission = mongoose.model('UserPermission', userPermissionSchema);

module.exports = UserPermission;