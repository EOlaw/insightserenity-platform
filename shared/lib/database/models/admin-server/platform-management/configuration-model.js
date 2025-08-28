'use strict';

/**
 * @fileoverview System configuration management model
 * @module servers/admin-server/modules/platform-management/models/configuration-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../../base-model');
const logger = require('../../../../utils/logger');
const { AppError } = require('../../../../utils/app-error');
const EncryptionService = require('../../../../security/encryption/encryption-service');
const stringHelper = require('../../../../utils/helpers/string-helper');

/**
 * @typedef {Object} ConfigurationItem
 * @property {string} key - Configuration key (dot notation supported)
 * @property {*} value - Configuration value
 * @property {string} type - Value type (string|number|boolean|object|array)
 * @property {string} category - Configuration category
 * @property {string} description - Configuration description
 * @property {boolean} encrypted - Whether value is encrypted
 * @property {boolean} sensitive - Whether value is sensitive
 * @property {Object} validation - Validation rules
 * @property {*} defaultValue - Default value
 * @property {Array<string>} allowedValues - Allowed values for enums
 * @property {Object} metadata - Additional metadata
 */

/**
 * @typedef {Object} ConfigurationVersion
 * @property {number} version - Version number
 * @property {Object} changes - Changes in this version
 * @property {string} changeType - Type of change (create|update|delete)
 * @property {Date} createdAt - Version creation timestamp
 * @property {string} createdBy - User who created version
 * @property {string} comment - Version comment
 * @property {Object} previousValue - Previous value (for updates)
 * @property {Object} newValue - New value
 */

/**
 * @typedef {Object} ConfigurationEnvironment
 * @property {string} environment - Environment name
 * @property {Object} overrides - Environment-specific overrides
 * @property {boolean} locked - Whether environment is locked
 * @property {Date} lastSync - Last sync timestamp
 * @property {string} syncStatus - Sync status
 */

/**
 * Configuration management schema definition
 */
const configurationSchemaSchemaDefinition = {
  // Configuration Identity
  configId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => `CONFIG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    description: 'Unique configuration identifier'
  },

  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 100,
    match: /^[a-zA-Z0-9_-]+$/,
    description: 'Configuration set name'
  },

  displayName: {
    type: String,
    required: true,
    trim: true,
    description: 'Human-readable configuration name'
  },

  description: {
    type: String,
    trim: true,
    maxlength: 500,
    description: 'Configuration set description'
  },

  // Configuration Items
  configurations: [{
    key: {
      type: String,
      required: true,
      trim: true,
      match: /^[a-zA-Z0-9_.]+$/,
      description: 'Configuration key (dot notation)'
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      description: 'Configuration value'
    },
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'object', 'array', 'json', 'url', 'email', 'regex'],
      required: true,
      description: 'Value data type'
    },
    category: {
      type: String,
      required: true,
      trim: true,
      description: 'Configuration category'
    },
    subcategory: {
      type: String,
      trim: true,
      description: 'Configuration subcategory'
    },
    description: {
      type: String,
      trim: true,
      description: 'Configuration description'
    },
    encrypted: {
      type: Boolean,
      default: false,
      description: 'Whether value is encrypted'
    },
    sensitive: {
      type: Boolean,
      default: false,
      description: 'Whether value is sensitive'
    },
    editable: {
      type: Boolean,
      default: true,
      description: 'Whether value can be edited'
    },
    validation: {
      required: {
        type: Boolean,
        default: false,
        description: 'Whether value is required'
      },
      min: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Minimum value/length'
      },
      max: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Maximum value/length'
      },
      pattern: {
        type: String,
        description: 'Regex pattern for validation'
      },
      customValidator: {
        type: String,
        description: 'Custom validation function name'
      }
    },
    defaultValue: {
      type: mongoose.Schema.Types.Mixed,
      description: 'Default value'
    },
    allowedValues: [{
      type: mongoose.Schema.Types.Mixed,
      description: 'Allowed values for enums'
    }],
    dependencies: [{
      key: {
        type: String,
        description: 'Dependent configuration key'
      },
      condition: {
        type: String,
        description: 'Dependency condition'
      }
    }],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      description: 'Additional metadata'
    },
    lastModified: {
      type: Date,
      default: Date.now,
      description: 'Last modification timestamp'
    },
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'User who last modified'
    }
  }],

  // Environment-specific Configurations
  environments: [{
    environment: {
      type: String,
      required: true,
      enum: ['development', 'staging', 'production', 'testing'],
      description: 'Environment name'
    },
    overrides: [{
      key: {
        type: String,
        required: true,
        description: 'Configuration key to override'
      },
      value: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
        description: 'Override value'
      },
      encrypted: {
        type: Boolean,
        default: false,
        description: 'Whether override is encrypted'
      },
      reason: {
        type: String,
        description: 'Reason for override'
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        description: 'User who approved override'
      },
      approvedAt: {
        type: Date,
        description: 'Approval timestamp'
      }
    }],
    locked: {
      type: Boolean,
      default: false,
      description: 'Whether environment config is locked'
    },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'User who locked config'
    },
    lockedAt: {
      type: Date,
      description: 'Lock timestamp'
    },
    lockReason: {
      type: String,
      description: 'Reason for locking'
    },
    lastSync: {
      type: Date,
      description: 'Last sync timestamp'
    },
    syncStatus: {
      type: String,
      enum: ['synced', 'pending', 'failed', 'out-of-sync'],
      default: 'pending',
      description: 'Sync status'
    },
    syncError: {
      type: String,
      description: 'Last sync error message'
    }
  }],

  // Version History
  versions: [{
    version: {
      type: Number,
      required: true,
      min: 1,
      description: 'Version number'
    },
    changes: [{
      key: {
        type: String,
        required: true,
        description: 'Changed configuration key'
      },
      changeType: {
        type: String,
        enum: ['create', 'update', 'delete'],
        required: true,
        description: 'Type of change'
      },
      previousValue: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Previous value'
      },
      newValue: {
        type: mongoose.Schema.Types.Mixed,
        description: 'New value'
      },
      encrypted: {
        type: Boolean,
        default: false,
        description: 'Whether values are encrypted'
      }
    }],
    comment: {
      type: String,
      trim: true,
      description: 'Version comment'
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
      description: 'Version creation timestamp'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      description: 'User who created version'
    },
    approved: {
      type: Boolean,
      default: false,
      description: 'Whether version is approved'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'User who approved version'
    },
    approvedAt: {
      type: Date,
      description: 'Approval timestamp'
    },
    deployed: {
      type: Boolean,
      default: false,
      description: 'Whether version is deployed'
    },
    deployedAt: {
      type: Date,
      description: 'Deployment timestamp'
    },
    deployedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'User who deployed version'
    }
  }],

  currentVersion: {
    type: Number,
    default: 1,
    min: 1,
    description: 'Current version number'
  },

  // Access Control
  accessControl: {
    visibility: {
      type: String,
      enum: ['public', 'private', 'restricted'],
      default: 'private',
      description: 'Configuration visibility'
    },
    readRoles: [{
      type: String,
      description: 'Roles that can read configuration'
    }],
    writeRoles: [{
      type: String,
      description: 'Roles that can write configuration'
    }],
    approvalRequired: {
      type: Boolean,
      default: true,
      description: 'Whether changes require approval'
    },
    approvers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'Users who can approve changes'
    }],
    restrictions: [{
      type: {
        type: String,
        enum: ['ip', 'time', 'user', 'role'],
        description: 'Restriction type'
      },
      value: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Restriction value'
      },
      description: {
        type: String,
        description: 'Restriction description'
      }
    }]
  },

  // Validation Rules
  validationRules: [{
    name: {
      type: String,
      required: true,
      description: 'Rule name'
    },
    description: {
      type: String,
      description: 'Rule description'
    },
    type: {
      type: String,
      enum: ['schema', 'custom', 'dependency', 'format'],
      required: true,
      description: 'Rule type'
    },
    rule: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      description: 'Rule definition'
    },
    severity: {
      type: String,
      enum: ['error', 'warning', 'info'],
      default: 'error',
      description: 'Rule severity'
    },
    enabled: {
      type: Boolean,
      default: true,
      description: 'Whether rule is enabled'
    }
  }],

  // Templates and Inheritance
  template: {
    isTemplate: {
      type: Boolean,
      default: false,
      description: 'Whether this is a template'
    },
    templateName: {
      type: String,
      description: 'Template name if this is a template'
    },
    inheritsFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Configuration',
      description: 'Parent configuration to inherit from'
    },
    inheritanceMode: {
      type: String,
      enum: ['override', 'merge', 'append'],
      default: 'override',
      description: 'How to handle inheritance'
    }
  },

  // Import/Export Settings
  importExport: {
    exportFormat: {
      type: String,
      enum: ['json', 'yaml', 'xml', 'env'],
      default: 'json',
      description: 'Default export format'
    },
    includeMetadata: {
      type: Boolean,
      default: true,
      description: 'Include metadata in exports'
    },
    includeVersionHistory: {
      type: Boolean,
      default: false,
      description: 'Include version history in exports'
    },
    lastExport: {
      timestamp: {
        type: Date,
        description: 'Last export timestamp'
      },
      format: {
        type: String,
        description: 'Export format used'
      },
      exportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        description: 'User who exported'
      }
    },
    lastImport: {
      timestamp: {
        type: Date,
        description: 'Last import timestamp'
      },
      source: {
        type: String,
        description: 'Import source'
      },
      importedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        description: 'User who imported'
      }
    }
  },

  // Backup and Recovery
  backup: {
    enabled: {
      type: Boolean,
      default: true,
      description: 'Whether backup is enabled'
    },
    frequency: {
      type: String,
      enum: ['manual', 'hourly', 'daily', 'weekly', 'monthly'],
      default: 'daily',
      description: 'Backup frequency'
    },
    retentionDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365,
      description: 'Backup retention in days'
    },
    lastBackup: {
      timestamp: {
        type: Date,
        description: 'Last backup timestamp'
      },
      size: {
        type: Number,
        description: 'Backup size in bytes'
      },
      location: {
        type: String,
        description: 'Backup storage location'
      },
      status: {
        type: String,
        enum: ['success', 'failed', 'partial'],
        description: 'Backup status'
      }
    },
    backups: [{
      backupId: {
        type: String,
        description: 'Backup identifier'
      },
      timestamp: {
        type: Date,
        description: 'Backup timestamp'
      },
      version: {
        type: Number,
        description: 'Configuration version backed up'
      },
      size: {
        type: Number,
        description: 'Backup size in bytes'
      },
      checksum: {
        type: String,
        description: 'Backup checksum'
      }
    }]
  },

  // Audit Trail
  auditTrail: [{
    action: {
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'export', 'import', 'rollback', 'approve', 'deploy'],
      required: true,
      description: 'Action performed'
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      description: 'Action timestamp'
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      description: 'User who performed action'
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      description: 'Action details'
    },
    ipAddress: {
      type: String,
      description: 'Client IP address'
    },
    userAgent: {
      type: String,
      description: 'User agent string'
    }
  }],

  // Synchronization Settings
  synchronization: {
    enabled: {
      type: Boolean,
      default: false,
      description: 'Whether sync is enabled'
    },
    mode: {
      type: String,
      enum: ['push', 'pull', 'bidirectional'],
      default: 'push',
      description: 'Sync mode'
    },
    targets: [{
      name: {
        type: String,
        description: 'Target name'
      },
      type: {
        type: String,
        enum: ['database', 'file', 'api', 'git', 'consul', 'etcd'],
        description: 'Target type'
      },
      connection: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Connection details'
      },
      mapping: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Field mapping'
      },
      lastSync: {
        type: Date,
        description: 'Last sync timestamp'
      },
      syncStatus: {
        type: String,
        enum: ['success', 'failed', 'pending'],
        description: 'Sync status'
      }
    }],
    conflictResolution: {
      type: String,
      enum: ['local-wins', 'remote-wins', 'manual', 'merge'],
      default: 'manual',
      description: 'Conflict resolution strategy'
    }
  },

  // Metadata
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      description: 'User who created configuration'
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'User who last modified'
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true,
      description: 'Configuration tags'
    }],
    category: {
      type: String,
      trim: true,
      description: 'Configuration category'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      description: 'Configuration priority'
    },
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      description: 'Custom metadata fields'
    }
  },

  // Status
  status: {
    active: {
      type: Boolean,
      default: true,
      description: 'Whether configuration is active'
    },
    locked: {
      type: Boolean,
      default: false,
      description: 'Whether configuration is locked'
    },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'User who locked configuration'
    },
    lockedAt: {
      type: Date,
      description: 'Lock timestamp'
    },
    lockReason: {
      type: String,
      description: 'Reason for locking'
    },
    validationStatus: {
      type: String,
      enum: ['valid', 'invalid', 'pending', 'unknown'],
      default: 'unknown',
      description: 'Validation status'
    },
    validationErrors: [{
      key: String,
      error: String,
      severity: String
    }],
    lastValidated: {
      type: Date,
      description: 'Last validation timestamp'
    }
  }
}

const configurationSchema = BaseModel.createSchema(configurationSchemaSchemaDefinition, {
  collection: 'configuration_management',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// Indexes
configurationSchema.index({ configId: 1 }, { unique: true });
configurationSchema.index({ name: 1 }, { unique: true });
configurationSchema.index({ 'configurations.key': 1 });
configurationSchema.index({ 'configurations.category': 1 });
configurationSchema.index({ 'environments.environment': 1 });
configurationSchema.index({ 'status.active': 1 });
configurationSchema.index({ 'metadata.tags': 1 });
configurationSchema.index({ createdAt: -1 });

// Virtual properties
configurationSchema.virtual('configurationCount').get(function() {
  return this.configurations.length;
});

configurationSchema.virtual('environmentCount').get(function() {
  return this.environments.length;
});

configurationSchema.virtual('versionCount').get(function() {
  return this.versions.length;
});

configurationSchema.virtual('hasUnsavedChanges').get(function() {
  const latestVersion = this.versions[this.versions.length - 1];
  return latestVersion && !latestVersion.deployed;
});

configurationSchema.virtual('isLocked').get(function() {
  return this.status.locked || this.environments.some(env => env.locked);
});

// Instance methods
configurationSchema.methods.getValue = function(key, environment = null) {
  // Find base configuration
  const config = this.configurations.find(c => c.key === key);
  if (!config) {
    throw new AppError(`Configuration key '${key}' not found`, 404);
  }

  let value = config.value;

  // Apply environment override if specified
  if (environment) {
    const env = this.environments.find(e => e.environment === environment);
    if (env) {
      const override = env.overrides.find(o => o.key === key);
      if (override) {
        value = override.value;
      }
    }
  }

  // Decrypt if encrypted
  if (config.encrypted && value && typeof value === 'string' && value.startsWith('enc:')) {
    const encryptionService = new EncryptionService();
    value = encryptionService.decryptSync(value);
  }

  return value;
};

configurationSchema.methods.setValue = async function(key, value, options = {}) {
  try {
    const { 
      environment = null, 
      userId, 
      comment = null,
      createIfNotExists = false 
    } = options;

    // Validate configuration is not locked
    if (this.status.locked) {
      throw new AppError('Configuration is locked', 423);
    }

    // Check environment lock
    if (environment) {
      const env = this.environments.find(e => e.environment === environment);
      if (env && env.locked) {
        throw new AppError(`Environment '${environment}' is locked`, 423);
      }
    }

    // Find or create configuration item
    let config = this.configurations.find(c => c.key === key);
    
    if (!config) {
      if (!createIfNotExists) {
        throw new AppError(`Configuration key '${key}' not found`, 404);
      }
      
      config = {
        key,
        type: this.detectValueType(value),
        category: options.category || 'custom',
        description: options.description || `Configuration for ${key}`,
        defaultValue: value
      };
      
      this.configurations.push(config);
    }

    // Validate value type
    if (!this.validateValueType(value, config.type)) {
      throw new AppError(`Invalid value type for key '${key}'. Expected ${config.type}`, 400);
    }

    // Validate against allowed values
    if (config.allowedValues && config.allowedValues.length > 0) {
      if (!config.allowedValues.includes(value)) {
        throw new AppError(`Value '${value}' not allowed for key '${key}'`, 400);
      }
    }

    // Apply custom validation
    if (config.validation) {
      this.validateConfigValue(key, value, config.validation);
    }

    // Encrypt sensitive values
    let processedValue = value;
    if (config.sensitive || config.encrypted) {
      const encryptionService = new EncryptionService();
      processedValue = await encryptionService.encrypt(value.toString());
      config.encrypted = true;
    }

    // Store the change
    const previousValue = environment ? 
      this.getValue(key, environment) : 
      config.value;

    if (environment) {
      // Environment-specific override
      let env = this.environments.find(e => e.environment === environment);
      if (!env) {
        env = { environment, overrides: [] };
        this.environments.push(env);
      }

      const existingOverride = env.overrides.find(o => o.key === key);
      if (existingOverride) {
        existingOverride.value = processedValue;
        existingOverride.encrypted = config.encrypted;
      } else {
        env.overrides.push({
          key,
          value: processedValue,
          encrypted: config.encrypted,
          reason: comment
        });
      }
    } else {
      // Base configuration update
      config.value = processedValue;
    }

    config.lastModified = new Date();
    config.modifiedBy = userId;

    // Create version entry
    this.currentVersion++;
    this.versions.push({
      version: this.currentVersion,
      changes: [{
        key,
        changeType: previousValue === undefined ? 'create' : 'update',
        previousValue: config.encrypted ? '[encrypted]' : previousValue,
        newValue: config.encrypted ? '[encrypted]' : value,
        encrypted: config.encrypted
      }],
      comment,
      createdBy: userId,
      createdAt: new Date()
    });

    // Add audit trail entry
    this.auditTrail.push({
      action: 'update',
      performedBy: userId,
      details: {
        key,
        environment,
        changeType: previousValue === undefined ? 'create' : 'update'
      }
    });

    await this.save();

    logger.info('Configuration value set', {
      configId: this.configId,
      key,
      environment,
      userId
    });

    return this;
  } catch (error) {
    logger.error('Failed to set configuration value', {
      configId: this.configId,
      key,
      error: error.message
    });
    throw error instanceof AppError ? error : new AppError(`Failed to set configuration value: ${error.message}`, 500);
  }
};

configurationSchema.methods.deleteKey = async function(key, options = {}) {
  try {
    const { environment = null, userId, comment = null } = options;

    // Validate configuration is not locked
    if (this.status.locked) {
      throw new AppError('Configuration is locked', 423);
    }

    const config = this.configurations.find(c => c.key === key);
    if (!config) {
      throw new AppError(`Configuration key '${key}' not found`, 404);
    }

    if (!config.editable) {
      throw new AppError(`Configuration key '${key}' is not editable`, 403);
    }

    let previousValue;

    if (environment) {
      // Remove environment override
      const env = this.environments.find(e => e.environment === environment);
      if (!env) {
        throw new AppError(`Environment '${environment}' not found`, 404);
      }

      if (env.locked) {
        throw new AppError(`Environment '${environment}' is locked`, 423);
      }

      const overrideIndex = env.overrides.findIndex(o => o.key === key);
      if (overrideIndex === -1) {
        throw new AppError(`No override found for key '${key}' in environment '${environment}'`, 404);
      }

      previousValue = env.overrides[overrideIndex].value;
      env.overrides.splice(overrideIndex, 1);
    } else {
      // Remove base configuration
      previousValue = config.value;
      const configIndex = this.configurations.findIndex(c => c.key === key);
      this.configurations.splice(configIndex, 1);
    }

    // Create version entry
    this.currentVersion++;
    this.versions.push({
      version: this.currentVersion,
      changes: [{
        key,
        changeType: 'delete',
        previousValue: config.encrypted ? '[encrypted]' : previousValue,
        newValue: null,
        encrypted: config.encrypted
      }],
      comment,
      createdBy: userId,
      createdAt: new Date()
    });

    // Add audit trail entry
    this.auditTrail.push({
      action: 'delete',
      performedBy: userId,
      details: {
        key,
        environment
      }
    });

    await this.save();

    logger.info('Configuration key deleted', {
      configId: this.configId,
      key,
      environment,
      userId
    });

    return this;
  } catch (error) {
    logger.error('Failed to delete configuration key', {
      configId: this.configId,
      key,
      error: error.message
    });
    throw error instanceof AppError ? error : new AppError(`Failed to delete configuration key: ${error.message}`, 500);
  }
};

configurationSchema.methods.rollbackToVersion = async function(targetVersion, userId) {
  try {
    const version = this.versions.find(v => v.version === targetVersion);
    if (!version) {
      throw new AppError(`Version ${targetVersion} not found`, 404);
    }

    if (this.status.locked) {
      throw new AppError('Configuration is locked', 423);
    }

    // Apply all changes from target version
    for (const change of version.changes) {
      const config = this.configurations.find(c => c.key === change.key);
      
      switch (change.changeType) {
        case 'create':
        case 'update':
          if (config) {
            config.value = change.newValue;
            config.lastModified = new Date();
            config.modifiedBy = userId;
          } else if (change.changeType === 'create') {
            this.configurations.push({
              key: change.key,
              value: change.newValue,
              type: this.detectValueType(change.newValue),
              category: 'restored',
              lastModified: new Date(),
              modifiedBy: userId
            });
          }
          break;
          
        case 'delete':
          if (config) {
            const index = this.configurations.findIndex(c => c.key === change.key);
            this.configurations.splice(index, 1);
          }
          break;
      }
    }

    // Create new version for rollback
    this.currentVersion++;
    this.versions.push({
      version: this.currentVersion,
      changes: [{
        changeType: 'rollback',
        previousValue: this.currentVersion - 1,
        newValue: targetVersion
      }],
      comment: `Rolled back to version ${targetVersion}`,
      createdBy: userId,
      createdAt: new Date()
    });

    // Add audit trail entry
    this.auditTrail.push({
      action: 'rollback',
      performedBy: userId,
      details: {
        fromVersion: this.currentVersion - 1,
        toVersion: targetVersion
      }
    });

    await this.save();

    logger.info('Configuration rolled back', {
      configId: this.configId,
      targetVersion,
      userId
    });

    return this;
  } catch (error) {
    logger.error('Failed to rollback configuration', {
      configId: this.configId,
      targetVersion,
      error: error.message
    });
    throw error instanceof AppError ? error : new AppError(`Failed to rollback configuration: ${error.message}`, 500);
  }
};

configurationSchema.methods.export = async function(format = 'json', options = {}) {
  try {
    const {
      includeMetadata = this.importExport.includeMetadata,
      includeVersionHistory = this.importExport.includeVersionHistory,
      includeSensitive = false,
      environment = null
    } = options;

    const exportData = {
      name: this.name,
      displayName: this.displayName,
      description: this.description,
      configurations: {}
    };

    // Export configuration values
    for (const config of this.configurations) {
      let value = config.value;
      
      // Apply environment override if specified
      if (environment) {
        try {
          value = this.getValue(config.key, environment);
        } catch (e) {
          // Keep base value if no override exists
        }
      }

      // Handle sensitive values
      if (config.sensitive && !includeSensitive) {
        value = '[REDACTED]';
      }

      exportData.configurations[config.key] = includeMetadata ? {
        value,
        type: config.type,
        category: config.category,
        description: config.description,
        sensitive: config.sensitive,
        defaultValue: config.defaultValue
      } : value;
    }

    // Include metadata if requested
    if (includeMetadata) {
      exportData.metadata = {
        exportedAt: new Date(),
        version: this.currentVersion,
        environment,
        configurationCount: this.configurations.length
      };
    }

    // Include version history if requested
    if (includeVersionHistory) {
      exportData.versions = this.versions.map(v => ({
        version: v.version,
        createdAt: v.createdAt,
        comment: v.comment,
        changeCount: v.changes.length
      }));
    }

    // Format output based on requested format
    let output;
    switch (format) {
      case 'json':
        output = JSON.stringify(exportData, null, 2);
        break;
        
      case 'yaml':
        // Simplified YAML output
        output = this.toYAML(exportData);
        break;
        
      case 'env':
        // Environment variable format
        output = this.toEnvFormat(exportData.configurations);
        break;
        
      case 'xml':
        // Simplified XML output
        output = this.toXML(exportData);
        break;
        
      default:
        throw new AppError(`Unsupported export format: ${format}`, 400);
    }

    // Update export tracking
    this.importExport.lastExport = {
      timestamp: new Date(),
      format,
      exportedBy: options.userId
    };

    await this.save();

    logger.info('Configuration exported', {
      configId: this.configId,
      format,
      environment
    });

    return output;
  } catch (error) {
    logger.error('Failed to export configuration', {
      configId: this.configId,
      format,
      error: error.message
    });
    throw error instanceof AppError ? error : new AppError(`Failed to export configuration: ${error.message}`, 500);
  }
};

configurationSchema.methods.validate = async function() {
  const errors = [];
  const warnings = [];

  // Validate each configuration item
  for (const config of this.configurations) {
    try {
      // Type validation
      if (!this.validateValueType(config.value, config.type)) {
        errors.push({
          key: config.key,
          error: `Invalid type. Expected ${config.type}`,
          severity: 'error'
        });
      }

      // Required validation
      if (config.validation?.required && !config.value) {
        errors.push({
          key: config.key,
          error: 'Required value is missing',
          severity: 'error'
        });
      }

      // Custom validation
      if (config.validation) {
        try {
          this.validateConfigValue(config.key, config.value, config.validation);
        } catch (validationError) {
          errors.push({
            key: config.key,
            error: validationError.message,
            severity: 'error'
          });
        }
      }

      // Check dependencies
      if (config.dependencies) {
        for (const dep of config.dependencies) {
          const depConfig = this.configurations.find(c => c.key === dep.key);
          if (!depConfig || !depConfig.value) {
            warnings.push({
              key: config.key,
              error: `Dependency '${dep.key}' is missing or empty`,
              severity: 'warning'
            });
          }
        }
      }
    } catch (error) {
      errors.push({
        key: config.key,
        error: error.message,
        severity: 'error'
      });
    }
  }

  // Apply validation rules
  for (const rule of this.validationRules) {
    if (!rule.enabled) continue;

    try {
      const result = await this.applyValidationRule(rule);
      if (!result.valid) {
        const item = {
          key: result.key || 'global',
          error: result.message,
          severity: rule.severity
        };

        if (rule.severity === 'error') {
          errors.push(item);
        } else {
          warnings.push(item);
        }
      }
    } catch (error) {
      errors.push({
        key: 'validation-rule',
        error: `Rule '${rule.name}' failed: ${error.message}`,
        severity: 'error'
      });
    }
  }

  // Update validation status
  this.status.validationStatus = errors.length > 0 ? 'invalid' : 'valid';
  this.status.validationErrors = [...errors, ...warnings];
  this.status.lastValidated = new Date();

  await this.save();

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    timestamp: new Date()
  };
};

configurationSchema.methods.lock = async function(userId, reason) {
  if (this.status.locked) {
    throw new AppError('Configuration is already locked', 409);
  }

  this.status.locked = true;
  this.status.lockedBy = userId;
  this.status.lockedAt = new Date();
  this.status.lockReason = reason;

  // Add audit trail entry
  this.auditTrail.push({
    action: 'update',
    performedBy: userId,
    details: {
      action: 'lock',
      reason
    }
  });

  await this.save();

  logger.info('Configuration locked', {
    configId: this.configId,
    userId,
    reason
  });

  return this;
};

configurationSchema.methods.unlock = async function(userId) {
  if (!this.status.locked) {
    throw new AppError('Configuration is not locked', 409);
  }

  this.status.locked = false;
  this.status.lockedBy = null;
  this.status.lockedAt = null;
  this.status.lockReason = null;

  // Add audit trail entry
  this.auditTrail.push({
    action: 'update',
    performedBy: userId,
    details: {
      action: 'unlock'
    }
  });

  await this.save();

  logger.info('Configuration unlocked', {
    configId: this.configId,
    userId
  });

  return this;
};

// Private helper methods
configurationSchema.methods.detectValueType = function(value) {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) return 'url';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
  }
  return 'string';
};

configurationSchema.methods.validateValueType = function(value, expectedType) {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'json':
      try {
        JSON.parse(typeof value === 'string' ? value : JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    case 'url':
      return typeof value === 'string' && /^https?:\/\/.+/.test(value);
    case 'email':
      return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'regex':
      try {
        new RegExp(value);
        return true;
      } catch {
        return false;
      }
    default:
      return true;
  }
};

configurationSchema.methods.validateConfigValue = function(key, value, validation) {
  // Min/max validation
  if (validation.min !== undefined) {
    if (typeof value === 'number' && value < validation.min) {
      throw new Error(`Value must be at least ${validation.min}`);
    }
    if (typeof value === 'string' && value.length < validation.min) {
      throw new Error(`Length must be at least ${validation.min}`);
    }
    if (Array.isArray(value) && value.length < validation.min) {
      throw new Error(`Array must have at least ${validation.min} items`);
    }
  }

  if (validation.max !== undefined) {
    if (typeof value === 'number' && value > validation.max) {
      throw new Error(`Value must be at most ${validation.max}`);
    }
    if (typeof value === 'string' && value.length > validation.max) {
      throw new Error(`Length must be at most ${validation.max}`);
    }
    if (Array.isArray(value) && value.length > validation.max) {
      throw new Error(`Array must have at most ${validation.max} items`);
    }
  }

  // Pattern validation
  if (validation.pattern && typeof value === 'string') {
    const regex = new RegExp(validation.pattern);
    if (!regex.test(value)) {
      throw new Error(`Value does not match required pattern: ${validation.pattern}`);
    }
  }

  // Custom validator
  if (validation.customValidator) {
    // In production, implement custom validator execution
    logger.debug('Custom validator would be executed', {
      key,
      validator: validation.customValidator
    });
  }
};

configurationSchema.methods.applyValidationRule = async function(rule) {
  // Simplified validation rule application
  // In production, implement comprehensive rule engine
  switch (rule.type) {
    case 'schema':
      // Validate against JSON schema
      return { valid: true };
      
    case 'dependency':
      // Check configuration dependencies
      return { valid: true };
      
    case 'format':
      // Validate format requirements
      return { valid: true };
      
    case 'custom':
      // Execute custom validation logic
      return { valid: true };
      
    default:
      return { valid: false, message: `Unknown rule type: ${rule.type}` };
  }
};

configurationSchema.methods.toYAML = function(data) {
  // Simplified YAML conversion
  const yaml = [];
  
  const convertToYAML = (obj, indent = 0) => {
    const spaces = '  '.repeat(indent);
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        yaml.push(`${spaces}${key}: null`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        yaml.push(`${spaces}${key}:`);
        convertToYAML(value, indent + 1);
      } else if (Array.isArray(value)) {
        yaml.push(`${spaces}${key}:`);
        value.forEach(item => {
          if (typeof item === 'object') {
            yaml.push(`${spaces}  -`);
            convertToYAML(item, indent + 2);
          } else {
            yaml.push(`${spaces}  - ${item}`);
          }
        });
      } else {
        yaml.push(`${spaces}${key}: ${value}`);
      }
    }
  };
  
  convertToYAML(data);
  return yaml.join('\n');
};

configurationSchema.methods.toEnvFormat = function(configurations) {
  const env = [];
  
  const flattenObject = (obj, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const envKey = prefix ? `${prefix}_${key}` : key;
      
      if (typeof value === 'object' && !Array.isArray(value)) {
        flattenObject(value, envKey);
      } else {
        const envValue = Array.isArray(value) ? value.join(',') : value;
        env.push(`${envKey.toUpperCase()}=${envValue}`);
      }
    }
  };
  
  flattenObject(configurations);
  return env.join('\n');
};

configurationSchema.methods.toXML = function(data) {
  // Simplified XML conversion
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>'];
  xml.push('<configuration>');
  
  const convertToXML = (obj, indent = 1) => {
    const spaces = '  '.repeat(indent);
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        xml.push(`${spaces}<${key} />`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        xml.push(`${spaces}<${key}>`);
        convertToXML(value, indent + 1);
        xml.push(`${spaces}</${key}>`);
      } else if (Array.isArray(value)) {
        xml.push(`${spaces}<${key}>`);
        value.forEach(item => {
          xml.push(`${spaces}  <item>${item}</item>`);
        });
        xml.push(`${spaces}</${key}>`);
      } else {
        xml.push(`${spaces}<${key}>${value}</${key}>`);
      }
    }
  };
  
  convertToXML(data);
  xml.push('</configuration>');
  return xml.join('\n');
};

// Static methods
configurationSchema.statics.findByCategory = function(category) {
  return this.find({
    'configurations.category': category,
    'status.active': true
  });
};

configurationSchema.statics.findByEnvironment = function(environment) {
  return this.find({
    'environments.environment': environment,
    'status.active': true
  });
};

configurationSchema.statics.findByTag = function(tag) {
  return this.find({
    'metadata.tags': tag,
    'status.active': true
  });
};

configurationSchema.statics.searchConfigurations = function(query, options = {}) {
  const searchQuery = {
    'status.active': true,
    $or: [
      { name: new RegExp(query, 'i') },
      { displayName: new RegExp(query, 'i') },
      { description: new RegExp(query, 'i') },
      { 'configurations.key': new RegExp(query, 'i') },
      { 'configurations.description': new RegExp(query, 'i') },
      { 'metadata.tags': new RegExp(query, 'i') }
    ]
  };

  if (options.category) {
    searchQuery['configurations.category'] = options.category;
  }

  if (options.environment) {
    searchQuery['environments.environment'] = options.environment;
  }

  return this.find(searchQuery);
};

// Middleware
configurationSchema.pre('save', async function(next) {
  try {
    // Encrypt sensitive values that aren't already encrypted
    const encryptionService = new EncryptionService();
    
    for (const config of this.configurations) {
      if ((config.sensitive || config.encrypted) && 
          config.value && 
          typeof config.value === 'string' && 
          !config.value.startsWith('enc:')) {
        config.value = await encryptionService.encrypt(config.value);
        config.encrypted = true;
      }
    }

    // Encrypt environment overrides
    for (const env of this.environments) {
      for (const override of env.overrides) {
        const baseConfig = this.configurations.find(c => c.key === override.key);
        if (baseConfig && (baseConfig.sensitive || baseConfig.encrypted) &&
            override.value && 
            typeof override.value === 'string' && 
            !override.value.startsWith('enc:')) {
          override.value = await encryptionService.encrypt(override.value);
          override.encrypted = true;
        }
      }
    }

    // Clean up old audit trail entries (keep last 1000)
    if (this.auditTrail.length > 1000) {
      this.auditTrail = this.auditTrail.slice(-1000);
    }

    // Clean up old versions (keep last 100)
    if (this.versions.length > 100) {
      this.versions = this.versions.slice(-100);
    }

    next();
  } catch (error) {
    next(error);
  }
});

configurationSchema.post('save', function(doc) {
  logger.info('Configuration saved', {
    configId: doc.configId,
    name: doc.name,
    version: doc.currentVersion
  });
});

// ==================== Create Model ====================
const ConfigurationModel = BaseModel.createModel('Configuration', configurationSchema);

module.exports = ConfigurationModel;