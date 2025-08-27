'use strict';

/**
 * @fileoverview Role model for role-based access control
 * @module shared/lib/database/models/users/role-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/roles
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const { ROLES } = require('../../../utils/constants/roles');

/**
 * Role schema definition
 */
const roleSchemaDefinition = {
  // Basic Information
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
    match: /^[a-z0-9_-]+$/
  },

  displayName: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    required: true,
    maxlength: 1000
  },

  // Role hierarchy
  level: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    index: true
  },

  parentRole: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },

  childRoles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }],

  // Scope and context
  scope: {
    type: String,
    enum: ['system', 'organization', 'tenant', 'team', 'custom'],
    default: 'organization',
    required: true,
    index: true
  },

  context: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    }
  },

  // Permissions
  permissions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permission'
  }],

  deniedPermissions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permission'
  }],

  // Role attributes
  type: {
    type: String,
    enum: ['system', 'predefined', 'custom'],
    default: 'custom',
    index: true
  },

  category: {
    type: String,
    enum: [
      'administrative',
      'management',
      'operational',
      'support',
      'readonly',
      'guest',
      'special'
    ],
    required: true,
    index: true
  },

  // Access restrictions
  restrictions: {
    maxUsers: Number,
    requiresMfa: {
      type: Boolean,
      default: false
    },
    requiresApproval: {
      type: Boolean,
      default: false
    },
    approvers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    ipWhitelist: [String],
    timeRestrictions: {
      enabled: Boolean,
      allowedDays: [{
        type: Number,
        min: 0,
        max: 6
      }],
      allowedHours: {
        start: {
          type: Number,
          min: 0,
          max: 23
        },
        end: {
          type: Number,
          min: 0,
          max: 23
        }
      },
      timezone: String
    },
    sessionTimeout: Number, // in minutes
    concurrentSessions: {
      type: Number,
      default: 1
    }
  },

  // Assignment rules
  assignmentRules: [{
    type: {
      type: String,
      enum: ['attribute', 'group', 'dynamic', 'temporal']
    },
    conditions: [{
      field: String,
      operator: String,
      value: mongoose.Schema.Types.Mixed
    }],
    autoAssign: Boolean,
    expiresAfter: Number // in days
  }],

  // Role metadata
  tags: [{
    type: String,
    lowercase: true
  }],

  priority: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  isSystem: {
    type: Boolean,
    default: false,
    index: true
  },

  isDefault: {
    type: Boolean,
    default: false
  },

  // Usage tracking
  userCount: {
    type: Number,
    default: 0,
    index: true
  },

  lastAssignedAt: Date,

  // Compliance and audit
  compliance: {
    frameworks: [{
      type: String,
      enum: ['gdpr', 'hipaa', 'sox', 'pci', 'iso27001']
    }],
    certificationRequired: Boolean,
    certificationExpiry: Date,
    auditLevel: {
      type: String,
      enum: ['none', 'basic', 'detailed', 'full'],
      default: 'basic'
    }
  },

  // Custom attributes
  customAttributes: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // Lifecycle
  effectiveDate: {
    type: Date,
    default: Date.now
  },

  expirationDate: Date,

  deprecatedAt: Date,

  replacedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }
};

// Create schema
const roleSchema = BaseModel.createSchema(roleSchemaDefinition, {
  collection: 'roles',
  timestamps: true
});

// Indexes
roleSchema.index({ scope: 1, level: 1 });
roleSchema.index({ type: 1, category: 1 });
roleSchema.index({ 'context.organizationId': 1, isActive: 1 });
roleSchema.index({ 'context.tenantId': 1, isActive: 1 });
roleSchema.index({ name: 'text', displayName: 'text', description: 'text' });

// Virtual fields
roleSchema.virtual('isExpired').get(function() {
  return this.expirationDate && this.expirationDate < new Date();
});

roleSchema.virtual('isEffective').get(function() {
  const now = new Date();
  return this.effectiveDate <= now && (!this.expirationDate || this.expirationDate > now);
});

roleSchema.virtual('fullPermissions').get(async function() {
  if (!this.populated('permissions')) {
    await this.populate('permissions');
  }
  
  // Get inherited permissions from parent role
  let allPermissions = [...this.permissions];
  
  if (this.parentRole) {
    const parent = await this.model('Role').findById(this.parentRole).populate('permissions');
    if (parent) {
      allPermissions = [...allPermissions, ...parent.permissions];
    }
  }
  
  // Remove denied permissions
  const deniedIds = this.deniedPermissions.map(p => p.toString());
  return allPermissions.filter(p => !deniedIds.includes(p._id.toString()));
});

// Pre-save middleware
roleSchema.pre('save', async function(next) {
  try {
    // Validate role hierarchy
    if (this.parentRole) {
      const parent = await this.model('Role').findById(this.parentRole);
      if (!parent) {
        throw new AppError('Parent role not found', 404, 'PARENT_ROLE_NOT_FOUND');
      }
      
      // Ensure level is lower than parent
      if (this.level >= parent.level) {
        this.level = parent.level - 1;
      }
      
      // Inherit scope from parent if not set
      if (!this.scope) {
        this.scope = parent.scope;
      }
    }

    // Set default level based on category if not provided
    if (this.isNew && !this.level) {
      this.level = this.calculateDefaultLevel();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Post-save middleware
roleSchema.post('save', async function(doc) {
  // Update parent's child roles
  if (doc.parentRole) {
    await doc.model('Role').findByIdAndUpdate(
      doc.parentRole,
      { $addToSet: { childRoles: doc._id } }
    );
  }
});

// Instance methods
roleSchema.methods.calculateDefaultLevel = function() {
  const levelMap = {
    administrative: 90,
    management: 70,
    operational: 50,
    support: 30,
    readonly: 20,
    guest: 10,
    special: 60
  };
  
  return levelMap[this.category] || 50;
};

roleSchema.methods.addPermission = async function(permissionId) {
  const Permission = this.model('Permission');
  const permission = await Permission.findById(permissionId);
  
  if (!permission) {
    throw new AppError('Permission not found', 404, 'PERMISSION_NOT_FOUND');
  }

  // Check compatibility
  const compatibility = await permission.checkCompatibility(this.permissions);
  if (!compatibility.compatible) {
    throw new AppError(
      'Permission incompatible with current role permissions',
      409,
      'PERMISSION_INCOMPATIBLE',
      compatibility
    );
  }

  if (!this.permissions.includes(permissionId)) {
    this.permissions.push(permissionId);
    
    // Remove from denied permissions if present
    this.deniedPermissions = this.deniedPermissions.filter(
      p => !p.equals(permissionId)
    );
    
    await this.save();
  }

  return this;
};

roleSchema.methods.removePermission = async function(permissionId) {
  this.permissions = this.permissions.filter(p => !p.equals(permissionId));
  await this.save();
  return this;
};

roleSchema.methods.denyPermission = async function(permissionId) {
  if (!this.deniedPermissions.includes(permissionId)) {
    this.deniedPermissions.push(permissionId);
    
    // Remove from allowed permissions if present
    this.permissions = this.permissions.filter(p => !p.equals(permissionId));
    
    await this.save();
  }
  
  return this;
};

roleSchema.methods.checkTimeRestrictions = function() {
  if (!this.restrictions.timeRestrictions || !this.restrictions.timeRestrictions.enabled) {
    return true;
  }

  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  const { allowedDays, allowedHours } = this.restrictions.timeRestrictions;

  // Check day restriction
  if (allowedDays && allowedDays.length > 0 && !allowedDays.includes(day)) {
    return false;
  }

  // Check hour restriction
  if (allowedHours) {
    if (hour < allowedHours.start || hour > allowedHours.end) {
      return false;
    }
  }

  return true;
};

roleSchema.methods.checkIpRestriction = function(ipAddress) {
  if (!this.restrictions.ipWhitelist || this.restrictions.ipWhitelist.length === 0) {
    return true;
  }

  return this.restrictions.ipWhitelist.includes(ipAddress);
};

roleSchema.methods.canBeAssignedTo = async function(user) {
  // Check if role is active and effective
  if (!this.isActive || !this.isEffective) {
    return { allowed: false, reason: 'Role is not active or effective' };
  }

  // Check user limit
  if (this.restrictions.maxUsers && this.userCount >= this.restrictions.maxUsers) {
    return { allowed: false, reason: 'User limit reached for this role' };
  }

  // Check assignment rules
  for (const rule of this.assignmentRules) {
    const meetsConditions = rule.conditions.every(condition => {
      const userValue = this.getNestedValue(user, condition.field);
      return this.evaluateCondition(userValue, condition.operator, condition.value);
    });

    if (!meetsConditions) {
      return { allowed: false, reason: 'User does not meet assignment criteria' };
    }
  }

  return { allowed: true };
};

roleSchema.methods.getNestedValue = function(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

roleSchema.methods.evaluateCondition = function(value, operator, expected) {
  switch (operator) {
    case 'equals': return value === expected;
    case 'not_equals': return value !== expected;
    case 'contains': return value && value.includes(expected);
    case 'in': return Array.isArray(expected) && expected.includes(value);
    case 'not_in': return Array.isArray(expected) && !expected.includes(value);
    default: return false;
  }
};

roleSchema.methods.clone = async function(newName, modifications = {}) {
  const cloneData = this.toObject();
  
  delete cloneData._id;
  delete cloneData.createdAt;
  delete cloneData.updatedAt;
  delete cloneData.userCount;
  delete cloneData.lastAssignedAt;
  
  cloneData.name = newName;
  cloneData.type = 'custom';
  cloneData.isSystem = false;
  cloneData.isDefault = false;
  
  Object.assign(cloneData, modifications);
  
  const clonedRole = new this.model('Role')(cloneData);
  await clonedRole.save();
  
  return clonedRole;
};

// Static methods
roleSchema.statics.createRole = async function(roleData) {
  const {
    name,
    displayName,
    description,
    scope,
    category,
    permissions = [],
    restrictions = {},
    context = {}
  } = roleData;

  // Check if role already exists
  const existing = await this.findOne({ name });
  if (existing) {
    throw new AppError('Role already exists', 409, 'ROLE_EXISTS');
  }

  const role = new this({
    name,
    displayName,
    description,
    scope,
    category,
    permissions,
    restrictions,
    context
  });

  await role.save();

  logger.info('Role created', {
    roleId: role._id,
    name: role.name,
    scope: role.scope,
    category: role.category
  });

  return role;
};

roleSchema.statics.findByScope = async function(scope, context = {}) {
  const query = { scope, isActive: true };

  if (scope === 'organization' && context.organizationId) {
    query['context.organizationId'] = context.organizationId;
  } else if (scope === 'tenant' && context.tenantId) {
    query['context.tenantId'] = context.tenantId;
  } else if (scope === 'team' && context.teamId) {
    query['context.teamId'] = context.teamId;
  }

  return await this.find(query).sort({ level: -1, priority: -1 });
};

roleSchema.statics.getHierarchy = async function(roleId) {
  const role = await this.findById(roleId);
  if (!role) {
    throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
  }

  const hierarchy = {
    current: role,
    ancestors: [],
    descendants: []
  };

  // Get ancestors
  let currentRole = role;
  while (currentRole.parentRole) {
    const parent = await this.findById(currentRole.parentRole);
    if (!parent) break;
    hierarchy.ancestors.push(parent);
    currentRole = parent;
  }

  // Get descendants recursively
  const getDescendants = async (parentId) => {
    const children = await this.find({ parentRole: parentId });
    for (const child of children) {
      hierarchy.descendants.push(child);
      await getDescendants(child._id);
    }
  };

  await getDescendants(role._id);

  return hierarchy;
};

roleSchema.statics.assignToUser = async function(roleId, userId, options = {}) {
  const role = await this.findById(roleId);
  const User = this.model('User');
  const user = await User.findById(userId);

  if (!role || !user) {
    throw new AppError('Role or user not found', 404, 'NOT_FOUND');
  }

  // Check if role can be assigned
  const canAssign = await role.canBeAssignedTo(user);
  if (!canAssign.allowed) {
    throw new AppError(canAssign.reason, 403, 'ASSIGNMENT_NOT_ALLOWED');
  }

  // Add role to user
  if (!user.roles.includes(role.name)) {
    user.roles.push(role.name);
    await user.save();

    // Update role statistics
    role.userCount += 1;
    role.lastAssignedAt = new Date();
    await role.save();

    logger.info('Role assigned to user', {
      roleId: role._id,
      roleName: role.name,
      userId: user._id,
      assignedBy: options.assignedBy
    });
  }

  return { role, user };
};

roleSchema.statics.getRoleStatistics = async function(options = {}) {
  const { organizationId, tenantId } = options;

  const match = {};
  if (organizationId) {
    match['context.organizationId'] = organizationId;
  }
  if (tenantId) {
    match['context.tenantId'] = tenantId;
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalUsers: { $sum: '$userCount' },
        avgLevel: { $avg: '$level' },
        activeCount: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        withMfaRequired: {
          $sum: { $cond: ['$restrictions.requiresMfa', 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        category: '$_id',
        roleCount: '$count',
        totalUsers: 1,
        avgLevel: { $round: ['$avgLevel', 0] },
        activeCount: 1,
        mfaRequiredCount: '$withMfaRequired',
        avgUsersPerRole: {
          $cond: [
            { $gt: ['$count', 0] },
            { $divide: ['$totalUsers', '$count'] },
            0
          ]
        }
      }
    },
    { $sort: { totalUsers: -1 } }
  ]);

  return stats;
};

roleSchema.statics.getPermissionCoverage = async function(roleIds) {
  const roles = await this.find({ _id: { $in: roleIds } })
    .populate('permissions')
    .populate('deniedPermissions');

  const coverage = {
    allowedPermissions: new Set(),
    deniedPermissions: new Set(),
    effectivePermissions: new Set()
  };

  for (const role of roles) {
    // Add allowed permissions
    role.permissions.forEach(p => {
      coverage.allowedPermissions.add(p._id.toString());
    });

    // Add denied permissions
    role.deniedPermissions.forEach(p => {
      coverage.deniedPermissions.add(p._id.toString());
    });
  }

  // Calculate effective permissions (allowed - denied)
  coverage.allowedPermissions.forEach(p => {
    if (!coverage.deniedPermissions.has(p)) {
      coverage.effectivePermissions.add(p);
    }
  });

  return {
    allowed: Array.from(coverage.allowedPermissions),
    denied: Array.from(coverage.deniedPermissions),
    effective: Array.from(coverage.effectivePermissions)
  };
};

roleSchema.statics.seedDefaultRoles = async function() {
  const defaultRoles = ROLES;
  
  let created = 0;
  let skipped = 0;

  for (const roleData of defaultRoles) {
    try {
      const existing = await this.findOne({ name: roleData.name });
      
      if (!existing) {
        await this.create({
          ...roleData,
          type: 'system',
          isSystem: true
        });
        created++;
      } else {
        skipped++;
      }
    } catch (error) {
      logger.error('Error seeding role', {
        role: roleData.name,
        error: error.message
      });
    }
  }

  logger.info('Default roles seeded', { created, skipped });
  
  return { created, skipped };
};

// Create and export model
const RoleModel = BaseModel.createModel('Role', roleSchema);

module.exports = RoleModel;