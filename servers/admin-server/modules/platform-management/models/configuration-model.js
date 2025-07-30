'use strict';

/**
 * @fileoverview Configuration management model
 * @module servers/admin-server/modules/platform-management/models/configuration-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../shared/lib/utils/logger');
const AppError = require('../../../../../shared/lib/utils/app-error');
const EncryptionService = require('../../../../../shared/lib/security/encryption/encryption-service');

/**
 * Configuration schema definition
 */
const configurationSchemaDefinition = {
  // Configuration Identity
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
    match: /^[a-zA-Z0-9_./-]+$/
  },

  namespace: {
    type: String,
    required: true,
    index: true,
    enum: ['system', 'security', 'api', 'features', 'integrations', 'billing', 'notifications', 'custom']
  },

  // Configuration Value
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  valueType: {
    type: String,
    enum: ['string', 'number', 'boolean', 'object', 'array', 'json', 'encrypted'],
    required: true
  },

  // Configuration Metadata
  metadata: {
    displayName: String,
    description: String,
    category: String,
    tags: [String],
    documentation: String,
    examples: [mongoose.Schema.Types.Mixed],
    validation: {
      required: Boolean,
      min: Number,
      max: Number,
      pattern: String,
      enum: [mongoose.Schema.Types.Mixed],
      custom: String // Custom validation function name
    }
  },

  // Security Settings
  security: {
    encrypted: {
      type: Boolean,
      default: false
    },
    sensitive: {
      type: Boolean,
      default: false
    },
    readPermissions: [String],
    writePermissions: [String],
    accessLog: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      action: String,
      timestamp: Date,
      ipAddress: String
    }]
  },

  // Scope and Context
  scope: {
    level: {
      type: String,
      enum: ['global', 'organization', 'tenant', 'user'],
      default: 'global',
      required: true,
      index: true
    },
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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    }
  },

  // Versioning
  version: {
    current: {
      type: Number,
      default: 1
    },
    history: [{
      version: Number,
      value: mongoose.Schema.Types.Mixed,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changedAt: Date,
      changeReason: String
    }]
  },

  // Dependencies
  dependencies: [{
    key: String,
    condition: {
      operator: {
        type: String,
        enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'in']
      },
      value: mongoose.Schema.Types.Mixed
    },
    action: {
      type: String,
      enum: ['enable', 'disable', 'require', 'hide']
    }
  }],

  // Environment Specific
  environments: {
    development: mongoose.Schema.Types.Mixed,
    staging: mongoose.Schema.Types.Mixed,
    production: mongoose.Schema.Types.Mixed
  },

  // Override Rules
  overrides: [{
    condition: {
      field: String,
      operator: String,
      value: mongoose.Schema.Types.Mixed
    },
    value: mongoose.Schema.Types.Mixed,
    priority: Number
  }],

  // Status and Lifecycle
  status: {
    type: String,
    enum: ['active', 'deprecated', 'disabled', 'pending'],
    default: 'active',
    index: true
  },

  flags: {
    isDefault: Boolean,
    isSystem: Boolean,
    isReadOnly: Boolean,
    isDeprecated: Boolean,
    requiresRestart: Boolean,
    hotReloadable: Boolean
  },

  // Audit Trail
  audit: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvalRequired: Boolean,
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected']
    }
  },

  // Lifecycle Dates
  effectiveDate: {
    type: Date,
    default: Date.now
  },

  expirationDate: Date,

  deprecationDate: Date,

  deprecationMessage: String,

  // Cache Control
  cache: {
    enabled: {
      type: Boolean,
      default: true
    },
    ttl: {
      type: Number,
      default: 3600 // seconds
    },
    invalidatedAt: Date
  }
};

// Create schema
const configurationSchema = BaseModel.createSchema(configurationSchemaDefinition, {
  collection: 'configurations',
  timestamps: true
});

// Indexes
configurationSchema.index({ namespace: 1, key: 1 });
configurationSchema.index({ 'scope.level': 1, 'scope.organizationId': 1 });
configurationSchema.index({ status: 1, effectiveDate: 1 });
configurationSchema.index({ 'metadata.tags': 1 });
configurationSchema.index({ 'flags.isSystem': 1 });

// Virtual fields
configurationSchema.virtual('isEffective').get(function() {
  const now = new Date();
  return this.status === 'active' && 
         this.effectiveDate <= now && 
         (!this.expirationDate || this.expirationDate > now);
});

configurationSchema.virtual('fullKey').get(function() {
  return `${this.namespace}.${this.key}`;
});

// Pre-save middleware
configurationSchema.pre('save', async function(next) {
  try {
    // Encrypt sensitive values
    if (this.isModified('value') && this.security.encrypted) {
      if (typeof this.value === 'string') {
        this.value = await EncryptionService.encrypt(this.value);
        this.valueType = 'encrypted';
      } else {
        this.value = await EncryptionService.encrypt(JSON.stringify(this.value));
        this.valueType = 'encrypted';
      }
    }

    // Validate value based on type
    if (this.isModified('value') && !this.security.encrypted) {
      this.validateValue();
    }

    // Update version history
    if (this.isModified('value') && !this.isNew) {
      if (!this.version.history) this.version.history = [];
      
      this.version.history.push({
        version: this.version.current,
        value: this.value,
        changedBy: this.audit.lastModifiedBy,
        changedAt: new Date(),
        changeReason: this._changeReason
      });

      this.version.current += 1;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
configurationSchema.methods.validateValue = function() {
  const { validation } = this.metadata;
  if (!validation) return true;

  switch (this.valueType) {
    case 'number':
      if (typeof this.value !== 'number') {
        throw new AppError('Value must be a number', 400, 'INVALID_TYPE');
      }
      if (validation.min !== undefined && this.value < validation.min) {
        throw new AppError(`Value must be at least ${validation.min}`, 400, 'VALUE_TOO_LOW');
      }
      if (validation.max !== undefined && this.value > validation.max) {
        throw new AppError(`Value must be at most ${validation.max}`, 400, 'VALUE_TOO_HIGH');
      }
      break;

    case 'string':
      if (typeof this.value !== 'string') {
        throw new AppError('Value must be a string', 400, 'INVALID_TYPE');
      }
      if (validation.pattern) {
        const regex = new RegExp(validation.pattern);
        if (!regex.test(this.value)) {
          throw new AppError('Value does not match required pattern', 400, 'PATTERN_MISMATCH');
        }
      }
      break;

    case 'boolean':
      if (typeof this.value !== 'boolean') {
        throw new AppError('Value must be a boolean', 400, 'INVALID_TYPE');
      }
      break;

    case 'array':
      if (!Array.isArray(this.value)) {
        throw new AppError('Value must be an array', 400, 'INVALID_TYPE');
      }
      break;

    case 'object':
    case 'json':
      if (typeof this.value !== 'object' || this.value === null) {
        throw new AppError('Value must be an object', 400, 'INVALID_TYPE');
      }
      break;
  }

  if (validation.enum && validation.enum.length > 0) {
    if (!validation.enum.includes(this.value)) {
      throw new AppError('Value must be one of allowed values', 400, 'INVALID_ENUM_VALUE');
    }
  }

  return true;
};

configurationSchema.methods.decryptValue = async function() {
  if (!this.security.encrypted || this.valueType !== 'encrypted') {
    return this.value;
  }

  try {
    const decrypted = await EncryptionService.decrypt(this.value);
    
    // Try to parse as JSON
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    logger.error('Failed to decrypt configuration value', {
      key: this.key,
      error: error.message
    });
    throw new AppError('Failed to decrypt configuration', 500, 'DECRYPTION_FAILED');
  }
};

configurationSchema.methods.updateValue = async function(newValue, userId, reason) {
  this._changeReason = reason;
  this.value = newValue;
  this.audit.lastModifiedBy = userId;
  
  if (this.audit.approvalRequired && !this.flags.isSystem) {
    this.audit.approvalStatus = 'pending';
  }

  await this.save();

  logger.info('Configuration updated', {
    key: this.key,
    namespace: this.namespace,
    version: this.version.current,
    updatedBy: userId
  });

  return this;
};

configurationSchema.methods.rollbackToVersion = async function(version, userId, reason) {
  const historicalVersion = this.version.history.find(h => h.version === version);
  
  if (!historicalVersion) {
    throw new AppError('Version not found in history', 404, 'VERSION_NOT_FOUND');
  }

  this._changeReason = `Rollback to version ${version}: ${reason}`;
  this.value = historicalVersion.value;
  this.audit.lastModifiedBy = userId;

  await this.save();

  logger.info('Configuration rolled back', {
    key: this.key,
    namespace: this.namespace,
    rolledBackTo: version,
    currentVersion: this.version.current,
    rolledBackBy: userId
  });

  return this;
};

configurationSchema.methods.logAccess = async function(userId, action, ipAddress) {
  if (!this.security.accessLog) {
    this.security.accessLog = [];
  }

  this.security.accessLog.push({
    userId,
    action,
    timestamp: new Date(),
    ipAddress
  });

  // Keep only last 100 access logs
  if (this.security.accessLog.length > 100) {
    this.security.accessLog = this.security.accessLog.slice(-100);
  }

  await this.save();
};

configurationSchema.methods.checkDependencies = async function() {
  if (!this.dependencies || this.dependencies.length === 0) {
    return { satisfied: true, missing: [] };
  }

  const missing = [];
  
  for (const dep of this.dependencies) {
    const depConfig = await this.constructor.findOne({ key: dep.key });
    
    if (!depConfig || !this.evaluateCondition(depConfig.value, dep.condition)) {
      missing.push({
        key: dep.key,
        condition: dep.condition,
        action: dep.action
      });
    }
  }

  return {
    satisfied: missing.length === 0,
    missing
  };
};

configurationSchema.methods.evaluateCondition = function(value, condition) {
  switch (condition.operator) {
    case 'equals':
      return value === condition.value;
    case 'not_equals':
      return value !== condition.value;
    case 'greater_than':
      return value > condition.value;
    case 'less_than':
      return value < condition.value;
    case 'contains':
      return String(value).includes(condition.value);
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(value);
    default:
      return false;
  }
};

configurationSchema.methods.getEffectiveValue = function(context = {}) {
  // Check for environment-specific value
  const env = process.env.NODE_ENV || 'development';
  if (this.environments && this.environments[env] !== undefined) {
    return this.environments[env];
  }

  // Check for override rules
  if (this.overrides && this.overrides.length > 0) {
    const sortedOverrides = this.overrides.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    for (const override of sortedOverrides) {
      const contextValue = context[override.condition.field];
      if (contextValue && this.evaluateCondition(contextValue, override.condition)) {
        return override.value;
      }
    }
  }

  return this.value;
};

// Static methods
configurationSchema.statics.getConfiguration = async function(key, options = {}) {
  const { scope = {}, decrypt = false } = options;

  const query = { key, status: 'active' };

  // Apply scope filters
  if (scope.organizationId) {
    query.$or = [
      { 'scope.level': 'global' },
      { 
        'scope.level': 'organization',
        'scope.organizationId': scope.organizationId
      }
    ];
  }

  const configs = await this.find(query).sort({ 'scope.level': -1 });
  
  if (configs.length === 0) {
    throw new AppError('Configuration not found', 404, 'CONFIG_NOT_FOUND');
  }

  // Get the most specific configuration
  const config = configs[0];

  if (decrypt && config.security.encrypted) {
    config.value = await config.decryptValue();
  }

  return config;
};

configurationSchema.statics.setConfiguration = async function(data) {
  const {
    key,
    namespace,
    value,
    valueType,
    metadata = {},
    security = {},
    scope = { level: 'global' },
    userId
  } = data;

  let config = await this.findOne({ key, 'scope.level': scope.level });

  if (config) {
    return await config.updateValue(value, userId, 'Updated via API');
  }

  config = new this({
    key,
    namespace,
    value,
    valueType,
    metadata,
    security,
    scope,
    audit: {
      createdBy: userId,
      lastModifiedBy: userId
    }
  });

  await config.save();

  logger.info('Configuration created', {
    key: config.key,
    namespace: config.namespace,
    scope: config.scope.level,
    createdBy: userId
  });

  return config;
};

configurationSchema.statics.bulkUpdate = async function(configurations, userId) {
  const results = {
    successful: [],
    failed: []
  };

  for (const configData of configurations) {
    try {
      const config = await this.setConfiguration({
        ...configData,
        userId
      });
      results.successful.push({
        key: config.key,
        status: 'updated'
      });
    } catch (error) {
      results.failed.push({
        key: configData.key,
        error: error.message
      });
    }
  }

  return results;
};

configurationSchema.statics.getConfigurationsByNamespace = async function(namespace, options = {}) {
  const { scope = {}, includeDeprecated = false, decrypt = false } = options;

  const query = { namespace };

  if (!includeDeprecated) {
    query.status = { $ne: 'deprecated' };
  }

  if (scope.level) {
    query['scope.level'] = scope.level;
  }

  const configs = await this.find(query).sort({ key: 1 });

  if (decrypt) {
    for (const config of configs) {
      if (config.security.encrypted) {
        config.value = await config.decryptValue();
      }
    }
  }

  return configs;
};

configurationSchema.statics.exportConfigurations = async function(options = {}) {
  const { namespace, excludeSecrets = true } = options;

  const query = {};
  if (namespace) {
    query.namespace = namespace;
  }

  const configs = await this.find(query);

  const exported = configs.map(config => {
    const exportData = {
      key: config.key,
      namespace: config.namespace,
      value: config.value,
      valueType: config.valueType,
      metadata: config.metadata,
      scope: config.scope,
      status: config.status,
      flags: config.flags
    };

    if (excludeSecrets && config.security.sensitive) {
      exportData.value = '[REDACTED]';
    }

    return exportData;
  });

  return {
    exportDate: new Date(),
    totalConfigurations: exported.length,
    configurations: exported
  };
};

configurationSchema.statics.importConfigurations = async function(importData, userId) {
  const { configurations, overwrite = false } = importData;

  const results = {
    imported: 0,
    skipped: 0,
    errors: []
  };

  for (const configData of configurations) {
    try {
      const existing = await this.findOne({ key: configData.key });

      if (existing && !overwrite) {
        results.skipped++;
        continue;
      }

      await this.setConfiguration({
        ...configData,
        userId
      });

      results.imported++;
    } catch (error) {
      results.errors.push({
        key: configData.key,
        error: error.message
      });
    }
  }

  logger.info('Configurations imported', {
    imported: results.imported,
    skipped: results.skipped,
    errors: results.errors.length,
    importedBy: userId
  });

  return results;
};

// Create and export model
const ConfigurationModel = BaseModel.createModel('Configuration', configurationSchema);

module.exports = ConfigurationModel;