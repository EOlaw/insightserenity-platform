'use strict';

/**
 * @fileoverview Permission model for fine-grained access control
 * @module shared/lib/database/models/users/permission-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/permissions
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const { PERMISSIONS } = require('../../../utils/constants/permissions');

/**
 * Permission schema definition
 */
const permissionSchemaDefinition = {
  // Basic Information
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
    match: /^[a-z0-9_:]+$/,
    lowercase: true
  },

  displayName: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    required: true,
    maxlength: 500
  },

  // Permission categorization
  resource: {
    type: String,
    required: true,
    index: true,
    lowercase: true
  },

  action: {
    type: String,
    required: true,
    index: true,
    lowercase: true,
    enum: ['create', 'read', 'update', 'delete', 'execute', 'manage', 'approve', 'publish']
  },

  scope: {
    type: String,
    enum: ['global', 'organization', 'tenant', 'team', 'self'],
    default: 'organization',
    index: true
  },

  category: {
    type: String,
    required: true,
    enum: [
      'user_management',
      'organization_management',
      'billing',
      'security',
      'content',
      'analytics',
      'system',
      'integration',
      'workflow'
    ],
    index: true
  },

  // Permission conditions
  conditions: [{
    field: String,
    operator: {
      type: String,
      enum: ['equals', 'not_equals', 'contains', 'in', 'not_in', 'greater_than', 'less_than']
    },
    value: mongoose.Schema.Types.Mixed
  }],

  // Permission dependencies
  dependencies: [{
    permissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permission'
    },
    type: {
      type: String,
      enum: ['required', 'recommended'],
      default: 'required'
    }
  }],

  conflicts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permission'
  }],

  // Risk and compliance
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low',
    index: true
  },

  requiresMfa: {
    type: Boolean,
    default: false
  },

  requiresApproval: {
    type: Boolean,
    default: false
  },

  approvalLevel: {
    type: Number,
    min: 1,
    max: 3,
    default: 1
  },

  // Audit requirements
  auditLevel: {
    type: String,
    enum: ['none', 'basic', 'detailed', 'full'],
    default: 'basic'
  },

  retentionDays: {
    type: Number,
    default: 90
  },

  // Permission metadata
  tags: [{
    type: String,
    lowercase: true
  }],

  isSystem: {
    type: Boolean,
    default: false,
    index: true
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  isDeprecated: {
    type: Boolean,
    default: false
  },

  deprecationDate: Date,
  replacedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permission'
  },

  // Usage tracking
  usageCount: {
    type: Number,
    default: 0
  },

  lastUsedAt: Date,

  // API access
  allowedInApi: {
    type: Boolean,
    default: true
  },

  apiScopes: [{
    type: String,
    lowercase: true
  }],

  // Platform-specific settings
  platforms: {
    web: {
      enabled: { type: Boolean, default: true },
      uiComponents: [String]
    },
    mobile: {
      enabled: { type: Boolean, default: true },
      features: [String]
    },
    api: {
      enabled: { type: Boolean, default: true },
      endpoints: [String]
    }
  },

  // Custom attributes
  customAttributes: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
};

// Create schema
const permissionSchema = BaseModel.createSchema(permissionSchemaDefinition, {
  collection: 'permissions',
  timestamps: true
});

// Indexes
permissionSchema.index({ resource: 1, action: 1 });
permissionSchema.index({ category: 1, isActive: 1 });
permissionSchema.index({ scope: 1, riskLevel: 1 });
permissionSchema.index({ tags: 1 });
permissionSchema.index({ name: 'text', displayName: 'text', description: 'text' });

// Virtual fields
permissionSchema.virtual('fullName').get(function() {
  return `${this.resource}:${this.action}`;
});

permissionSchema.virtual('isHighRisk').get(function() {
  return this.riskLevel === 'high' || this.riskLevel === 'critical';
});

permissionSchema.virtual('requiresSpecialHandling').get(function() {
  return this.requiresMfa || this.requiresApproval || this.isHighRisk;
});

// Pre-save middleware
permissionSchema.pre('save', async function(next) {
  try {
    // Generate name from resource and action if not provided
    if (!this.name && this.resource && this.action) {
      this.name = `${this.resource}:${this.action}`.toLowerCase();
    }

    // Set risk level based on action and resource
    if (this.isNew) {
      this.riskLevel = this.calculateRiskLevel();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
permissionSchema.methods.calculateRiskLevel = function() {
  // Critical actions
  if (['delete', 'manage'].includes(this.action) && 
      ['system', 'security', 'billing'].includes(this.category)) {
    return 'critical';
  }

  // High risk actions
  if (['create', 'update', 'approve'].includes(this.action) && 
      ['user_management', 'organization_management'].includes(this.category)) {
    return 'high';
  }

  // Medium risk actions
  if (['update', 'publish'].includes(this.action)) {
    return 'medium';
  }

  // Default to low risk
  return 'low';
};

permissionSchema.methods.checkConditions = function(context) {
  if (!this.conditions || this.conditions.length === 0) {
    return true;
  }

  return this.conditions.every(condition => {
    const contextValue = this.getNestedValue(context, condition.field);
    
    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;
      case 'not_equals':
        return contextValue !== condition.value;
      case 'contains':
        return Array.isArray(contextValue) && contextValue.includes(condition.value);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(contextValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(contextValue);
      case 'greater_than':
        return contextValue > condition.value;
      case 'less_than':
        return contextValue < condition.value;
      default:
        return false;
    }
  });
};

permissionSchema.methods.getNestedValue = function(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

permissionSchema.methods.incrementUsage = async function() {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  await this.save();
  return this;
};

permissionSchema.methods.deprecate = async function(replacementId) {
  this.isDeprecated = true;
  this.deprecationDate = new Date();
  if (replacementId) {
    this.replacedBy = replacementId;
  }
  await this.save();
  return this;
};

permissionSchema.methods.checkCompatibility = async function(permissionIds) {
  // Check for conflicts
  const conflicts = await this.model('Permission').find({
    _id: { $in: permissionIds },
    conflicts: this._id
  });

  if (conflicts.length > 0) {
    return {
      compatible: false,
      conflicts: conflicts.map(p => ({
        id: p._id,
        name: p.name,
        displayName: p.displayName
      }))
    };
  }

  // Check for missing dependencies
  if (this.dependencies && this.dependencies.length > 0) {
    const requiredDeps = this.dependencies
      .filter(dep => dep.type === 'required')
      .map(dep => dep.permissionId.toString());

    const missingDeps = requiredDeps.filter(
      depId => !permissionIds.map(id => id.toString()).includes(depId)
    );

    if (missingDeps.length > 0) {
      const missing = await this.model('Permission').find({
        _id: { $in: missingDeps }
      });

      return {
        compatible: false,
        missingDependencies: missing.map(p => ({
          id: p._id,
          name: p.name,
          displayName: p.displayName
        }))
      };
    }
  }

  return { compatible: true };
};

// Static methods
permissionSchema.statics.createPermission = async function(permissionData) {
  const {
    name,
    displayName,
    description,
    resource,
    action,
    category,
    scope,
    conditions,
    dependencies,
    conflicts,
    riskLevel,
    tags
  } = permissionData;

  // Check if permission already exists
  const existing = await this.findOne({ name });
  if (existing) {
    throw new AppError('Permission already exists', 409, 'PERMISSION_EXISTS');
  }

  const permission = new this({
    name,
    displayName,
    description,
    resource,
    action,
    category,
    scope,
    conditions,
    dependencies,
    conflicts,
    riskLevel,
    tags
  });

  await permission.save();

  logger.info('Permission created', {
    permissionId: permission._id,
    name: permission.name,
    resource: permission.resource,
    action: permission.action
  });

  return permission;
};

permissionSchema.statics.findByResource = async function(resource, options = {}) {
  const query = { resource, isActive: true };
  
  if (options.action) {
    query.action = options.action;
  }

  if (options.scope) {
    query.scope = options.scope;
  }

  return await this.find(query).sort({ action: 1 });
};

permissionSchema.statics.findByCategory = async function(category, options = {}) {
  const query = { category, isActive: true };
  
  if (options.riskLevel) {
    query.riskLevel = options.riskLevel;
  }

  return await this.find(query).sort({ resource: 1, action: 1 });
};

permissionSchema.statics.searchPermissions = async function(searchQuery, options = {}) {
  const {
    categories,
    resources,
    actions,
    scopes,
    riskLevels,
    tags,
    includeDeprecated = false,
    limit = 50,
    skip = 0
  } = options;

  const query = {};

  if (searchQuery) {
    query.$text = { $search: searchQuery };
  }

  if (categories && categories.length > 0) {
    query.category = { $in: categories };
  }

  if (resources && resources.length > 0) {
    query.resource = { $in: resources };
  }

  if (actions && actions.length > 0) {
    query.action = { $in: actions };
  }

  if (scopes && scopes.length > 0) {
    query.scope = { $in: scopes };
  }

  if (riskLevels && riskLevels.length > 0) {
    query.riskLevel = { $in: riskLevels };
  }

  if (tags && tags.length > 0) {
    query.tags = { $in: tags };
  }

  if (!includeDeprecated) {
    query.isDeprecated = false;
  }

  query.isActive = true;

  const permissions = await this.find(query)
    .limit(limit)
    .skip(skip)
    .sort({ category: 1, resource: 1, action: 1 });

  const total = await this.countDocuments(query);

  return {
    permissions,
    total,
    hasMore: total > skip + permissions.length
  };
};

permissionSchema.statics.getPermissionMatrix = async function(roleIds) {
  const permissions = await this.aggregate([
    {
      $lookup: {
        from: 'roles',
        let: { permId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $in: ['$_id', roleIds] },
                  { $in: ['$$permId', '$permissions'] }
                ]
              }
            }
          }
        ],
        as: 'roles'
      }
    },
    {
      $project: {
        name: 1,
        displayName: 1,
        resource: 1,
        action: 1,
        category: 1,
        riskLevel: 1,
        roles: {
          $map: {
            input: '$roles',
            as: 'role',
            in: {
              id: '$$role._id',
              name: '$$role.name'
            }
          }
        }
      }
    },
    {
      $group: {
        _id: '$resource',
        permissions: {
          $push: {
            id: '$_id',
            name: '$name',
            displayName: '$displayName',
            action: '$action',
            riskLevel: '$riskLevel',
            roles: '$roles'
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return permissions;
};

permissionSchema.statics.getUsageStatistics = async function(options = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options;

  const stats = await this.aggregate([
    {
      $match: {
        lastUsedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$category',
        totalUsage: { $sum: '$usageCount' },
        uniquePermissions: { $sum: 1 },
        avgUsagePerPermission: { $avg: '$usageCount' },
        highRiskUsage: {
          $sum: {
            $cond: [
              { $in: ['$riskLevel', ['high', 'critical']] },
              '$usageCount',
              0
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        category: '$_id',
        totalUsage: 1,
        uniquePermissions: 1,
        avgUsagePerPermission: { $round: ['$avgUsagePerPermission', 2] },
        highRiskUsage: 1,
        highRiskPercentage: {
          $multiply: [
            { $divide: ['$highRiskUsage', '$totalUsage'] },
            100
          ]
        }
      }
    },
    { $sort: { totalUsage: -1 } }
  ]);

  return stats;
};

permissionSchema.statics.seedDefaultPermissions = async function() {
  const defaultPermissions = Object.values(PERMISSIONS).flat();
  
  let created = 0;
  let skipped = 0;

  for (const permData of defaultPermissions) {
    try {
      const existing = await this.findOne({ name: permData.name });
      
      if (!existing) {
        await this.create(permData);
        created++;
      } else {
        skipped++;
      }
    } catch (error) {
      logger.error('Error seeding permission', {
        permission: permData.name,
        error: error.message
      });
    }
  }

  logger.info('Default permissions seeded', { created, skipped });
  
  return { created, skipped };
};

// Create and export model
const PermissionModel = BaseModel.createModel('Permission', permissionSchema);

module.exports = {
  schema: permissionSchema,
  model: PermissionModel
};