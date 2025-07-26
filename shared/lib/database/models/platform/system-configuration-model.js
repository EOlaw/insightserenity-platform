'use strict';

/**
 * @fileoverview System configuration model for platform-wide and tenant-specific settings
 * @module shared/lib/database/models/platform/system-configuration-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/cache-helper
 * @requires module:shared/lib/services/cache-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/app-error');
const encryptionService = require('../../../security/encryption/encryption-service');
const auditService = require('../../../security/audit/audit-service');
const validators = require('../../../utils/validators/common-validators');
const cacheHelper = require('../../../utils/helpers/cache-helper');
const cacheService = require('../../../services/cache-service');

/**
 * System configuration schema definition for dynamic platform settings
 */
const systemConfigurationSchemaDefinition = {
  // ==================== Scope & Identity ====================
  scope: {
    type: String,
    required: true,
    enum: ['global', 'tenant', 'organization', 'environment'],
    index: true
  },

  scopeId: {
    type: mongoose.Schema.Types.Mixed,
    index: true,
    validate: {
      validator: function(value) {
        if (this.scope === 'global') return !value;
        if (this.scope === 'tenant') return mongoose.Types.ObjectId.isValid(value);
        if (this.scope === 'organization') return mongoose.Types.ObjectId.isValid(value);
        if (this.scope === 'environment') return typeof value === 'string';
        return false;
      },
      message: 'Invalid scopeId for the specified scope'
    }
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  // ==================== Configuration Details ====================
  configKey: {
    type: String,
    required: true,
    trim: true,
    match: /^[a-zA-Z0-9_.-]+$/,
    validate: {
      validator: function(value) {
        return value.length >= 3 && value.length <= 100;
      },
      message: 'Config key must be between 3 and 100 characters'
    }
  },

  namespace: {
    type: String,
    required: true,
    default: 'default',
    trim: true,
    match: /^[a-zA-Z0-9_.-]+$/
  },

  displayName: {
    type: String,
    required: true,
    maxlength: 200
  },

  description: {
    type: String,
    maxlength: 1000
  },

  category: {
    type: String,
    required: true,
    enum: [
      'general', 'security', 'billing', 'features', 'integrations',
      'notifications', 'performance', 'compliance', 'appearance',
      'localization', 'api', 'limits', 'experimental'
    ],
    index: true
  },

  // ==================== Value Configuration ====================
  value: {
    data: mongoose.Schema.Types.Mixed,
    encrypted: {
      type: Boolean,
      default: false
    },
    encryptedValue: String
  },

  defaultValue: mongoose.Schema.Types.Mixed,

  dataType: {
    type: String,
    required: true,
    enum: ['string', 'number', 'boolean', 'json', 'array', 'date', 'regex', 'url', 'email']
  },

  validation: {
    required: {
      type: Boolean,
      default: false
    },
    
    string: {
      minLength: Number,
      maxLength: Number,
      pattern: String,
      enum: [String]
    },
    
    number: {
      min: Number,
      max: Number,
      integer: Boolean,
      multipleOf: Number
    },
    
    array: {
      minItems: Number,
      maxItems: Number,
      uniqueItems: Boolean,
      itemType: String
    },
    
    custom: {
      validator: String,
      message: String
    }
  },

  // ==================== Security & Access Control ====================
  security: {
    isSecure: {
      type: Boolean,
      default: false,
      index: true
    },
    
    accessLevel: {
      type: String,
      enum: ['public', 'internal', 'admin', 'super_admin'],
      default: 'internal'
    },
    
    permissions: {
      read: [String],
      write: [String],
      delete: [String]
    },
    
    encryption: {
      algorithm: {
        type: String,
        default: 'aes-256-gcm'
      },
      keyVersion: Number
    },
    
    audit: {
      enabled: {
        type: Boolean,
        default: true
      },
      level: {
        type: String,
        enum: ['none', 'basic', 'detailed', 'full'],
        default: 'basic'
      }
    }
  },

  // ==================== Versioning & History ====================
  versioning: {
    enabled: {
      type: Boolean,
      default: true
    },
    
    version: {
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
      changeReason: String,
      changeType: {
        type: String,
        enum: ['create', 'update', 'delete', 'restore']
      },
      metadata: mongoose.Schema.Types.Mixed
    }],
    
    maxVersions: {
      type: Number,
      default: 10
    }
  },

  // ==================== Feature Flags & Toggles ====================
  featureFlag: {
    isFeatureFlag: {
      type: Boolean,
      default: false
    },
    
    rollout: {
      strategy: {
        type: String,
        enum: ['all', 'percentage', 'whitelist', 'blacklist', 'gradual', 'custom']
      },
      percentage: {
        type: Number,
        min: 0,
        max: 100
      },
      whitelist: [mongoose.Schema.Types.Mixed],
      blacklist: [mongoose.Schema.Types.Mixed],
      gradualRollout: {
        startDate: Date,
        endDate: Date,
        startPercentage: Number,
        endPercentage: Number
      },
      customRules: mongoose.Schema.Types.Mixed
    },
    
    targeting: {
      users: [String],
      organizations: [String],
      segments: [String],
      conditions: [mongoose.Schema.Types.Mixed]
    },
    
    monitoring: {
      enabled: Boolean,
      metrics: [String],
      alerts: [mongoose.Schema.Types.Mixed]
    }
  },

  // ==================== Environment & Deployment ====================
  environment: {
    applicable: [String],
    overrides: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    inheritance: {
      enabled: {
        type: Boolean,
        default: true
      },
      parent: String,
      strategy: {
        type: String,
        enum: ['merge', 'override', 'custom'],
        default: 'merge'
      }
    }
  },

  // ==================== UI & Presentation ====================
  ui: {
    displayOrder: {
      type: Number,
      default: 0
    },
    
    inputType: {
      type: String,
      enum: ['text', 'number', 'toggle', 'select', 'multiselect', 'json', 'code', 'color', 'date', 'file']
    },
    
    inputConfig: {
      placeholder: String,
      helpText: String,
      options: [mongoose.Schema.Types.Mixed],
      allowCustom: Boolean,
      codeLanguage: String,
      fileTypes: [String]
    },
    
    grouping: {
      group: String,
      subgroup: String,
      section: String
    },
    
    visibility: {
      condition: String,
      dependsOn: [String]
    }
  },

  // ==================== Cache Configuration ====================
  cache: {
    enabled: {
      type: Boolean,
      default: true
    },
    
    ttl: {
      type: Number,
      default: 300 // 5 minutes
    },
    
    invalidateOn: [String],
    
    tags: [String],
    
    warmup: {
      enabled: Boolean,
      priority: Number
    }
  },

  // ==================== Status & Lifecycle ====================
  status: {
    state: {
      type: String,
      enum: ['active', 'inactive', 'deprecated', 'testing', 'maintenance'],
      default: 'active',
      index: true
    },
    
    effectiveDate: Date,
    expirationDate: Date,
    
    deprecation: {
      isDeprecated: Boolean,
      deprecatedAt: Date,
      deprecationMessage: String,
      alternativeKey: String,
      removalDate: Date
    },
    
    maintenance: {
      underMaintenance: Boolean,
      maintenanceMessage: String,
      expectedEndTime: Date
    }
  },

  // ==================== Dependencies & Relations ====================
  dependencies: {
    requires: [String],
    conflicts: [String],
    enhances: [String],
    
    validation: {
      type: String,
      enum: ['strict', 'warn', 'ignore'],
      default: 'warn'
    }
  },

  // ==================== Metadata & Tags ====================
  metadata: {
    tags: {
      type: [String],
      index: true
    },
    
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    
    source: {
      type: String,
      enum: ['manual', 'api', 'import', 'migration', 'system'],
      default: 'manual'
    },
    
    importId: String,
    
    documentation: {
      url: String,
      notes: String
    },
    
    owner: {
      team: String,
      email: String
    }
  },

  // ==================== Audit & Compliance ====================
  compliance: {
    classification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'internal'
    },
    
    regulations: [String],
    
    retention: {
      policy: String,
      days: Number,
      deleteAfter: Date
    },
    
    pii: {
      containsPii: Boolean,
      piiTypes: [String]
    }
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
};

// Create schema
const systemConfigurationSchema = BaseModel.createSchema(systemConfigurationSchemaDefinition, {
  collection: 'system_configurations',
  timestamps: true,
  versionKey: false
});

// ==================== Indexes ====================
// Compound unique index for configuration keys within scope
systemConfigurationSchema.index({ 
  scope: 1, 
  scopeId: 1, 
  namespace: 1, 
  configKey: 1 
}, { unique: true });

systemConfigurationSchema.index({ category: 1, 'status.state': 1 });
systemConfigurationSchema.index({ 'security.isSecure': 1, 'security.accessLevel': 1 });
systemConfigurationSchema.index({ 'featureFlag.isFeatureFlag': 1 });
systemConfigurationSchema.index({ 'status.effectiveDate': 1, 'status.expirationDate': 1 });
systemConfigurationSchema.index({ 'metadata.tags': 1 });

// ==================== Virtual Fields ====================
systemConfigurationSchema.virtual('fullKey').get(function() {
  return `${this.namespace}:${this.configKey}`;
});

systemConfigurationSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status.state === 'active' &&
         (!this.status.effectiveDate || this.status.effectiveDate <= now) &&
         (!this.status.expirationDate || this.status.expirationDate > now);
});

systemConfigurationSchema.virtual('isExpired').get(function() {
  return this.status.expirationDate && this.status.expirationDate < new Date();
});

systemConfigurationSchema.virtual('cacheKey').get(function() {
  return cacheHelper.generateKey('config', this.scope, this.scopeId, this.fullKey);
});

// ==================== Pre-save Middleware ====================
systemConfigurationSchema.pre('save', async function(next) {
  try {
    // Validate data type
    if (!this.validateDataType()) {
      throw new AppError('Invalid value for specified data type', 400, 'INVALID_DATA_TYPE');
    }

    // Encrypt secure values
    if (this.security.isSecure && this.value.data !== undefined && !this.value.encrypted) {
      await this.encryptValue();
    }

    // Update version
    if (!this.isNew && this.isModified('value')) {
      await this.updateVersion();
    }

    // Set scope IDs based on scope type
    this.setScopeIds();

    // Validate dependencies
    if (this.dependencies.requires.length > 0) {
      await this.validateDependencies();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
systemConfigurationSchema.post('save', async function(doc) {
  try {
    // Clear cache
    await cacheService.delete(doc.cacheKey);
    
    // Invalidate related caches
    if (doc.cache.invalidateOn.length > 0) {
      await Promise.all(
        doc.cache.invalidateOn.map(tag => cacheService.deleteByTag(tag))
      );
    }

    // Audit log
    if (doc.security.audit.enabled) {
      await auditService.logConfigurationChange({
        configKey: doc.fullKey,
        scope: doc.scope,
        scopeId: doc.scopeId,
        action: doc.isNew ? 'created' : 'updated',
        changedBy: doc.updatedBy || doc.createdBy,
        previousValue: doc.versioning.history.length > 1 ? 
          doc.versioning.history[doc.versioning.history.length - 2].value : null,
        newValue: doc.value.data,
        metadata: {
          version: doc.versioning.version,
          category: doc.category,
          isSecure: doc.security.isSecure
        }
      });
    }
  } catch (error) {
    logger.error('Error in configuration post-save hook', {
      error: error.message,
      configKey: doc.fullKey
    });
  }
});

// ==================== Instance Methods ====================
systemConfigurationSchema.methods.validateDataType = function() {
  const value = this.value.data;
  
  switch (this.dataType) {
    case 'string':
      if (typeof value !== 'string') return false;
      if (this.validation.string) {
        if (this.validation.string.minLength && value.length < this.validation.string.minLength) return false;
        if (this.validation.string.maxLength && value.length > this.validation.string.maxLength) return false;
        if (this.validation.string.pattern && !new RegExp(this.validation.string.pattern).test(value)) return false;
        if (this.validation.string.enum && !this.validation.string.enum.includes(value)) return false;
      }
      return true;
      
    case 'number':
      if (typeof value !== 'number') return false;
      if (this.validation.number) {
        if (this.validation.number.min !== undefined && value < this.validation.number.min) return false;
        if (this.validation.number.max !== undefined && value > this.validation.number.max) return false;
        if (this.validation.number.integer && !Number.isInteger(value)) return false;
        if (this.validation.number.multipleOf && value % this.validation.number.multipleOf !== 0) return false;
      }
      return true;
      
    case 'boolean':
      return typeof value === 'boolean';
      
    case 'json':
      try {
        if (typeof value === 'string') JSON.parse(value);
        return true;
      } catch {
        return false;
      }
      
    case 'array':
      if (!Array.isArray(value)) return false;
      if (this.validation.array) {
        if (this.validation.array.minItems && value.length < this.validation.array.minItems) return false;
        if (this.validation.array.maxItems && value.length > this.validation.array.maxItems) return false;
        if (this.validation.array.uniqueItems && new Set(value).size !== value.length) return false;
      }
      return true;
      
    case 'date':
      return value instanceof Date || !isNaN(Date.parse(value));
      
    case 'regex':
      try {
        new RegExp(value);
        return true;
      } catch {
        return false;
      }
      
    case 'url':
      return validators.isURL(value);
      
    case 'email':
      return validators.isEmail(value);
      
    default:
      return true;
  }
};

systemConfigurationSchema.methods.encryptValue = async function() {
  if (!this.value.data) return;
  
  const plainValue = typeof this.value.data === 'object' ? 
    JSON.stringify(this.value.data) : String(this.value.data);
  
  this.value.encryptedValue = await encryptionService.encrypt(plainValue);
  this.value.encrypted = true;
  this.value.data = undefined; // Remove plain value
  this.security.encryption.keyVersion = await encryptionService.getCurrentKeyVersion();
};

systemConfigurationSchema.methods.decryptValue = async function() {
  if (!this.value.encrypted || !this.value.encryptedValue) {
    return this.value.data;
  }
  
  const decrypted = await encryptionService.decrypt(this.value.encryptedValue);
  
  // Parse back to original type
  switch (this.dataType) {
    case 'json':
    case 'array':
      return JSON.parse(decrypted);
    case 'number':
      return Number(decrypted);
    case 'boolean':
      return decrypted === 'true';
    case 'date':
      return new Date(decrypted);
    default:
      return decrypted;
  }
};

systemConfigurationSchema.methods.getValue = async function() {
  if (this.value.encrypted) {
    return await this.decryptValue();
  }
  return this.value.data;
};

systemConfigurationSchema.methods.setValue = async function(newValue, changedBy, reason) {
  // Store previous value in history
  if (this.versioning.enabled) {
    await this.updateVersion(changedBy, reason);
  }
  
  this.value.data = newValue;
  this.value.encrypted = false;
  this.value.encryptedValue = undefined;
  
  if (this.security.isSecure) {
    await this.encryptValue();
  }
  
  this.updatedBy = changedBy;
  await this.save();
  
  return this;
};

systemConfigurationSchema.methods.updateVersion = async function(changedBy, reason) {
  const currentValue = await this.getValue();
  
  this.versioning.history.push({
    version: this.versioning.version,
    value: currentValue,
    changedBy: changedBy || this.updatedBy,
    changedAt: new Date(),
    changeReason: reason,
    changeType: this.isNew ? 'create' : 'update'
  });
  
  // Trim history if needed
  if (this.versioning.history.length > this.versioning.maxVersions) {
    this.versioning.history = this.versioning.history.slice(-this.versioning.maxVersions);
  }
  
  this.versioning.version += 1;
};

systemConfigurationSchema.methods.rollbackToVersion = async function(version, changedBy, reason) {
  const historicalVersion = this.versioning.history.find(h => h.version === version);
  
  if (!historicalVersion) {
    throw new AppError('Version not found in history', 404, 'VERSION_NOT_FOUND');
  }
  
  await this.setValue(historicalVersion.value, changedBy, reason || `Rollback to version ${version}`);
  
  return this;
};

systemConfigurationSchema.methods.setScopeIds = function() {
  switch (this.scope) {
    case 'global':
      this.scopeId = null;
      this.tenantId = null;
      this.organizationId = null;
      break;
    case 'tenant':
      this.tenantId = this.scopeId;
      this.organizationId = null;
      break;
    case 'organization':
      this.organizationId = this.scopeId;
      // Tenant ID should be set separately
      break;
    case 'environment':
      // Environment is a string scope ID
      this.tenantId = null;
      this.organizationId = null;
      break;
  }
};

systemConfigurationSchema.methods.validateDependencies = async function() {
  const missingDeps = [];
  
  for (const dep of this.dependencies.requires) {
    const exists = await this.constructor.exists({
      scope: this.scope,
      scopeId: this.scopeId,
      configKey: dep,
      'status.state': 'active'
    });
    
    if (!exists) {
      missingDeps.push(dep);
    }
  }
  
  if (missingDeps.length > 0) {
    if (this.dependencies.validation === 'strict') {
      throw new AppError(
        `Missing required dependencies: ${missingDeps.join(', ')}`,
        400,
        'MISSING_DEPENDENCIES'
      );
    } else if (this.dependencies.validation === 'warn') {
      logger.warn('Configuration has missing dependencies', {
        configKey: this.fullKey,
        missingDeps
      });
    }
  }
  
  return true;
};

systemConfigurationSchema.methods.evaluateFeatureFlag = function(context = {}) {
  if (!this.featureFlag.isFeatureFlag) {
    throw new AppError('Not a feature flag', 400, 'NOT_FEATURE_FLAG');
  }
  
  const { userId, organizationId, customAttributes } = context;
  
  // Check targeting first
  if (this.featureFlag.targeting) {
    if (userId && this.featureFlag.targeting.users.includes(userId)) return true;
    if (organizationId && this.featureFlag.targeting.organizations.includes(organizationId)) return true;
  }
  
  // Apply rollout strategy
  switch (this.featureFlag.rollout.strategy) {
    case 'all':
      return true;
      
    case 'percentage':
      // Use consistent hashing for user
      if (userId) {
        const hash = require('crypto').createHash('md5').update(userId + this.configKey).digest('hex');
        const hashNum = parseInt(hash.substring(0, 8), 16);
        return (hashNum % 100) < this.featureFlag.rollout.percentage;
      }
      return false;
      
    case 'whitelist':
      return userId && this.featureFlag.rollout.whitelist.includes(userId);
      
    case 'blacklist':
      return userId && !this.featureFlag.rollout.blacklist.includes(userId);
      
    case 'gradual':
      const now = new Date();
      const { startDate, endDate, startPercentage, endPercentage } = this.featureFlag.rollout.gradualRollout;
      
      if (now < startDate) return false;
      if (now > endDate) return this.evaluatePercentage(endPercentage, userId);
      
      // Calculate current percentage based on time
      const totalTime = endDate - startDate;
      const elapsedTime = now - startDate;
      const progress = elapsedTime / totalTime;
      const currentPercentage = startPercentage + (endPercentage - startPercentage) * progress;
      
      return this.evaluatePercentage(currentPercentage, userId);
      
    default:
      return false;
  }
};

systemConfigurationSchema.methods.evaluatePercentage = function(percentage, userId) {
  if (!userId) return false;
  const hash = require('crypto').createHash('md5').update(userId + this.configKey).digest('hex');
  const hashNum = parseInt(hash.substring(0, 8), 16);
  return (hashNum % 100) < percentage;
};

// ==================== Static Methods ====================
systemConfigurationSchema.statics.getConfiguration = async function(key, scope = 'global', scopeId = null) {
  // Check cache first
  const cacheKey = cacheHelper.generateKey('config', scope, scopeId, key);
  const cached = await cacheService.get(cacheKey);
  if (cached) return cached;
  
  const [namespace, configKey] = key.includes(':') ? key.split(':') : ['default', key];
  
  const config = await this.findOne({
    scope,
    scopeId,
    namespace,
    configKey,
    'status.state': 'active',
    $or: [
      { 'status.effectiveDate': { $exists: false } },
      { 'status.effectiveDate': { $lte: new Date() } }
    ],
    $and: [
      { $or: [
        { 'status.expirationDate': { $exists: false } },
        { 'status.expirationDate': { $gt: new Date() } }
      ]}
    ]
  });
  
  if (!config) {
    throw new AppError(`Configuration not found: ${key}`, 404, 'CONFIG_NOT_FOUND');
  }
  
  const value = await config.getValue();
  
  // Cache the value
  if (config.cache.enabled) {
    await cacheService.set(cacheKey, value, config.cache.ttl);
  }
  
  return value;
};

systemConfigurationSchema.statics.setConfiguration = async function(key, value, options = {}) {
  const {
    scope = 'global',
    scopeId = null,
    changedBy,
    reason,
    category = 'general',
    dataType = 'string',
    isSecure = false
  } = options;
  
  const [namespace, configKey] = key.includes(':') ? key.split(':') : ['default', key];
  
  let config = await this.findOne({
    scope,
    scopeId,
    namespace,
    configKey
  });
  
  if (config) {
    await config.setValue(value, changedBy, reason);
  } else {
    config = await this.create({
      scope,
      scopeId,
      namespace,
      configKey,
      displayName: options.displayName || configKey,
      description: options.description,
      category,
      dataType,
      value: { data: value },
      security: { isSecure },
      createdBy: changedBy
    });
  }
  
  return config;
};

systemConfigurationSchema.statics.getConfigurationsByScope = async function(scope, scopeId, options = {}) {
  const {
    category,
    namespace = 'default',
    includeInactive = false,
    decrypt = false
  } = options;
  
  const query = {
    scope,
    scopeId,
    namespace
  };
  
  if (!includeInactive) {
    query['status.state'] = 'active';
  }
  
  if (category) {
    query.category = category;
  }
  
  const configs = await this.find(query).sort({ 'ui.displayOrder': 1, configKey: 1 });
  
  if (decrypt) {
    const decryptedConfigs = await Promise.all(
      configs.map(async (config) => ({
        key: config.fullKey,
        value: await config.getValue(),
        displayName: config.displayName,
        description: config.description,
        category: config.category,
        dataType: config.dataType,
        isSecure: config.security.isSecure
      }))
    );
    return decryptedConfigs;
  }
  
  return configs;
};

systemConfigurationSchema.statics.bulkUpdate = async function(updates, changedBy) {
  const results = {
    successful: [],
    failed: []
  };
  
  for (const update of updates) {
    try {
      const config = await this.setConfiguration(
        update.key,
        update.value,
        {
          ...update.options,
          changedBy
        }
      );
      results.successful.push({
        key: update.key,
        configId: config._id
      });
    } catch (error) {
      results.failed.push({
        key: update.key,
        error: error.message
      });
    }
  }
  
  logger.info('Bulk configuration update completed', {
    successful: results.successful.length,
    failed: results.failed.length
  });
  
  return results;
};

systemConfigurationSchema.statics.getFeatureFlags = async function(scope = 'global', scopeId = null) {
  return await this.find({
    scope,
    scopeId,
    'featureFlag.isFeatureFlag': true,
    'status.state': 'active'
  });
};

systemConfigurationSchema.statics.evaluateFeatureFlags = async function(context) {
  const flags = await this.getFeatureFlags(context.scope, context.scopeId);
  const evaluations = {};
  
  for (const flag of flags) {
    evaluations[flag.fullKey] = flag.evaluateFeatureFlag(context);
  }
  
  return evaluations;
};

systemConfigurationSchema.statics.exportConfigurations = async function(filters = {}) {
  const configs = await this.find(filters).select('-value.encryptedValue -versioning.history');
  
  const exported = await Promise.all(
    configs.map(async (config) => {
      const data = config.toObject();
      if (!config.security.isSecure) {
        data.value = await config.getValue();
      }
      return data;
    })
  );
  
  return {
    exportDate: new Date(),
    version: '1.0',
    configurations: exported
  };
};

systemConfigurationSchema.statics.importConfigurations = async function(data, options = {}) {
  const { overwrite = false, changedBy } = options;
  const results = {
    imported: 0,
    skipped: 0,
    errors: []
  };
  
  for (const configData of data.configurations) {
    try {
      const exists = await this.exists({
        scope: configData.scope,
        scopeId: configData.scopeId,
        namespace: configData.namespace,
        configKey: configData.configKey
      });
      
      if (exists && !overwrite) {
        results.skipped++;
        continue;
      }
      
      const config = exists ? 
        await this.findOne({
          scope: configData.scope,
          scopeId: configData.scopeId,
          namespace: configData.namespace,
          configKey: configData.configKey
        }) : new this();
      
      Object.assign(config, {
        ...configData,
        metadata: {
          ...configData.metadata,
          source: 'import',
          importId: data.importId || stringHelper.generateRandomString(16)
        },
        createdBy: config.createdBy || changedBy,
        updatedBy: changedBy
      });
      
      await config.save();
      results.imported++;
    } catch (error) {
      results.errors.push({
        configKey: configData.configKey,
        error: error.message
      });
    }
  }
  
  logger.info('Configuration import completed', results);
  return results;
};

// Create and export model
const SystemConfigurationModel = BaseModel.createModel('SystemConfiguration', systemConfigurationSchema);

module.exports = {
  schema: systemConfigurationSchema,
  model: SystemConfigurationModel
};