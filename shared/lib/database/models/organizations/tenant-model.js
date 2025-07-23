'use strict';

/**
 * @fileoverview Tenant model for multi-tenant database architecture
 * @module shared/lib/database/models/tenant-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const stringHelper = require('../../utils/helpers/string-helper');

/**
 * Tenant schema definition
 */
const tenantSchemaDefinition = {
  // Tenant Identification
  tenantId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9_-]+$/,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  displayName: {
    type: String,
    trim: true,
    maxlength: 100
  },

  description: {
    type: String,
    maxlength: 500
  },

  // Tenant Type & Tier
  type: {
    type: String,
    enum: ['trial', 'standard', 'premium', 'enterprise', 'custom'],
    default: 'standard',
    index: true
  },

  isolationStrategy: {
    type: String,
    enum: ['database', 'schema', 'collection', 'hybrid'],
    default: 'database',
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['provisioning', 'active', 'inactive', 'suspended', 'deleted', 'migrating'],
    default: 'provisioning',
    index: true
  },

  statusReason: String,
  statusChangedAt: Date,
  statusChangedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Lifecycle
  provisionedAt: Date,
  activatedAt: Date,
  suspendedAt: Date,
  deletedAt: Date,
  expiresAt: Date,

  // Database Configuration
  database: {
    connectionString: {
      type: String,
      select: false
    },
    databaseName: String,
    schemaPrefix: String,
    host: String,
    port: Number,
    replicaSet: String,
    options: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    }
  },

  // Resource Configuration
  resources: {
    maxUsers: {
      type: Number,
      default: 50
    },
    maxStorage: {
      type: Number,
      default: 10737418240 // 10GB in bytes
    },
    maxDatabases: {
      type: Number,
      default: 1
    },
    maxCollections: {
      type: Number,
      default: 100
    },
    maxApiCalls: {
      type: Number,
      default: 100000
    },
    maxBandwidth: {
      type: Number,
      default: 107374182400 // 100GB in bytes
    },
    dedicatedResources: {
      type: Boolean,
      default: false
    },
    computeUnits: {
      type: Number,
      default: 1
    },
    memoryMB: {
      type: Number,
      default: 512
    }
  },

  // Current Usage
  usage: {
    users: {
      type: Number,
      default: 0
    },
    storage: {
      type: Number,
      default: 0
    },
    databases: {
      type: Number,
      default: 0
    },
    collections: {
      type: Number,
      default: 0
    },
    apiCalls: {
      type: Number,
      default: 0
    },
    bandwidth: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    },
    lastCalculatedAt: Date
  },

  // Features
  features: {
    multiDatabase: {
      type: Boolean,
      default: false
    },
    customDomain: {
      type: Boolean,
      default: false
    },
    sslCertificate: {
      type: Boolean,
      default: true
    },
    backup: {
      enabled: {
        type: Boolean,
        default: true
      },
      frequency: {
        type: String,
        enum: ['hourly', 'daily', 'weekly', 'monthly'],
        default: 'daily'
      },
      retention: {
        type: Number,
        default: 7 // days
      }
    },
    replication: {
      enabled: {
        type: Boolean,
        default: false
      },
      regions: [String]
    },
    encryption: {
      atRest: {
        type: Boolean,
        default: true
      },
      inTransit: {
        type: Boolean,
        default: true
      }
    },
    monitoring: {
      enabled: {
        type: Boolean,
        default: true
      },
      level: {
        type: String,
        enum: ['basic', 'advanced', 'premium'],
        default: 'basic'
      }
    },
    compliance: {
      gdpr: {
        type: Boolean,
        default: false
      },
      hipaa: {
        type: Boolean,
        default: false
      },
      soc2: {
        type: Boolean,
        default: false
      },
      pci: {
        type: Boolean,
        default: false
      }
    }
  },

  // Configuration
  configuration: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    defaultLanguage: {
      type: String,
      default: 'en'
    },
    allowedOrigins: [String],
    customHeaders: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    rateLimit: {
      enabled: {
        type: Boolean,
        default: true
      },
      requests: {
        type: Number,
        default: 1000
      },
      window: {
        type: Number,
        default: 900000 // 15 minutes in ms
      }
    },
    sessionTimeout: {
      type: Number,
      default: 1800000 // 30 minutes in ms
    },
    passwordPolicy: {
      minLength: {
        type: Number,
        default: 8
      },
      requireUppercase: {
        type: Boolean,
        default: true
      },
      requireNumbers: {
        type: Boolean,
        default: true
      },
      requireSpecialChars: {
        type: Boolean,
        default: false
      },
      expirationDays: {
        type: Number,
        default: 0
      }
    }
  },

  // Billing
  billing: {
    customerId: String,
    subscriptionId: String,
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', 'custom'],
      default: 'monthly'
    },
    nextBillingDate: Date,
    amount: Number,
    currency: {
      type: String,
      default: 'USD'
    },
    paymentMethod: {
      type: {
        type: String,
        enum: ['card', 'bank', 'invoice']
      },
      last4: String
    },
    invoices: [{
      invoiceId: String,
      date: Date,
      amount: Number,
      status: String,
      paidAt: Date
    }]
  },

  // Ownership
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Migrations
  migrations: [{
    version: String,
    appliedAt: Date,
    duration: Number,
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed']
    },
    error: String
  }],

  // Backups
  backups: [{
    backupId: String,
    createdAt: Date,
    size: Number,
    type: {
      type: String,
      enum: ['manual', 'scheduled', 'pre-migration']
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed']
    },
    location: String,
    expiresAt: Date
  }],

  // Performance Metrics
  metrics: {
    responseTime: {
      avg: Number,
      p95: Number,
      p99: Number
    },
    errorRate: Number,
    uptime: Number,
    lastCalculatedAt: Date
  },

  // Security
  security: {
    lastSecurityScan: Date,
    vulnerabilities: {
      critical: {
        type: Number,
        default: 0
      },
      high: {
        type: Number,
        default: 0
      },
      medium: {
        type: Number,
        default: 0
      },
      low: {
        type: Number,
        default: 0
      }
    },
    securityScore: {
      type: Number,
      min: 0,
      max: 100
    },
    incidents: [{
      date: Date,
      type: String,
      severity: String,
      resolved: Boolean,
      resolvedAt: Date
    }]
  },

  // Metadata
  tags: [String],
  customFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Search
  searchableText: {
    type: String,
    select: false,
    searchable: true
  }
};

// Create schema
const tenantSchema = BaseModel.createSchema(tenantSchemaDefinition, {
  collection: 'tenants',
  timestamps: true
});

// Indexes
tenantSchema.index({ organizationId: 1, status: 1 });
tenantSchema.index({ type: 1, status: 1 });
tenantSchema.index({ 'billing.nextBillingDate': 1 });
tenantSchema.index({ expiresAt: 1 });
tenantSchema.index({ statusChangedAt: -1 });

// Virtual fields
tenantSchema.virtual('isActive').get(function() {
  return this.status === 'active';
});

tenantSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

tenantSchema.virtual('daysUntilExpiration').get(function() {
  if (!this.expiresAt) return null;
  const days = Math.ceil((this.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
});

tenantSchema.virtual('storageUsagePercent').get(function() {
  if (!this.resources.maxStorage) return 0;
  return (this.usage.storage / this.resources.maxStorage) * 100;
});

tenantSchema.virtual('userUsagePercent').get(function() {
  if (!this.resources.maxUsers) return 0;
  return (this.usage.users / this.resources.maxUsers) * 100;
});

tenantSchema.virtual('healthScore').get(function() {
  let score = 100;

  // Deduct for high resource usage
  if (this.storageUsagePercent > 90) score -= 10;
  if (this.userUsagePercent > 90) score -= 10;

  // Deduct for errors
  if (this.metrics.errorRate > 5) score -= 20;
  if (this.metrics.errorRate > 1) score -= 10;

  // Deduct for security issues
  score -= this.security.vulnerabilities.critical * 20;
  score -= this.security.vulnerabilities.high * 10;
  score -= this.security.vulnerabilities.medium * 5;

  return Math.max(0, Math.min(100, score));
});

// Pre-save middleware
tenantSchema.pre('save', async function(next) {
  try {
    // Generate tenant ID if not provided
    if (!this.tenantId && this.isNew) {
      this.tenantId = await this.constructor.generateUniqueTenantId(this.name);
    }

    // Set display name if not provided
    if (!this.displayName) {
      this.displayName = this.name;
    }

    // Update searchable text
    this.searchableText = [
      this.tenantId,
      this.name,
      this.displayName,
      this.description
    ].filter(Boolean).join(' ').toLowerCase();

    // Set database name based on isolation strategy
    if (!this.database.databaseName && this.isolationStrategy === 'database') {
      this.database.databaseName = `tenant_${this.tenantId}`;
    }

    // Set schema prefix for schema isolation
    if (!this.database.schemaPrefix && this.isolationStrategy === 'schema') {
      this.database.schemaPrefix = `${this.tenantId}_`;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
tenantSchema.methods.provision = async function() {
  if (this.status !== 'provisioning') {
    throw new AppError('Tenant must be in provisioning status', 400, 'INVALID_STATUS');
  }

  try {
    // Provision based on isolation strategy
    switch (this.isolationStrategy) {
      case 'database':
        await this.#provisionDatabase();
        break;
      case 'schema':
        await this.#provisionSchema();
        break;
      case 'collection':
        // No special provisioning needed
        break;
      case 'hybrid':
        await this.#provisionHybrid();
        break;
    }

    this.status = 'active';
    this.provisionedAt = new Date();
    this.activatedAt = new Date();
    await this.save();

    logger.info('Tenant provisioned', {
      tenantId: this.tenantId,
      isolationStrategy: this.isolationStrategy
    });

    return this;
  } catch (error) {
    this.status = 'failed';
    this.statusReason = error.message;
    await this.save();
    throw error;
  }
};

tenantSchema.methods.suspend = async function(reason, suspendedBy) {
  if (this.status === 'suspended') {
    return this;
  }

  this.status = 'suspended';
  this.statusReason = reason;
  this.statusChangedAt = new Date();
  this.statusChangedBy = suspendedBy;
  this.suspendedAt = new Date();

  await this.save();
  await this.audit('TENANT_SUSPENDED', { reason });

  return this;
};

tenantSchema.methods.reactivate = async function(reactivatedBy) {
  if (this.status !== 'suspended') {
    throw new AppError('Tenant must be suspended to reactivate', 400, 'INVALID_STATUS');
  }

  this.status = 'active';
  this.statusReason = 'Reactivated';
  this.statusChangedAt = new Date();
  this.statusChangedBy = reactivatedBy;
  this.suspendedAt = null;

  await this.save();
  await this.audit('TENANT_REACTIVATED');

  return this;
};

tenantSchema.methods.updateResources = async function(resources) {
  Object.assign(this.resources, resources);
  await this.save();
  await this.audit('TENANT_RESOURCES_UPDATED', { resources });
  return this;
};

tenantSchema.methods.updateUsage = async function(metric, value) {
  const usageField = `usage.${metric}`;
  const currentUsage = this.get(usageField) || 0;
  
  this.set(usageField, value);
  this.usage.lastCalculatedAt = new Date();

  // Check if usage exceeds limits
  const resourceField = `resources.max${metric.charAt(0).toUpperCase() + metric.slice(1)}`;
  const maxResource = this.get(resourceField);

  if (maxResource && value > maxResource) {
    logger.warn('Tenant usage exceeds limit', {
      tenantId: this.tenantId,
      metric,
      current: value,
      max: maxResource
    });
  }

  await this.save();
  return this;
};

tenantSchema.methods.incrementUsage = async function(metric, amount = 1) {
  const usageField = `usage.${metric}`;
  const currentUsage = this.get(usageField) || 0;
  return await this.updateUsage(metric, currentUsage + amount);
};

tenantSchema.methods.resetUsage = async function(metrics = ['apiCalls', 'bandwidth']) {
  for (const metric of metrics) {
    this.set(`usage.${metric}`, 0);
  }
  
  this.usage.lastResetDate = new Date();
  await this.save();
  return this;
};

tenantSchema.methods.createBackup = async function(type = 'manual') {
  const backupId = `backup_${this.tenantId}_${Date.now()}`;
  
  const backup = {
    backupId,
    createdAt: new Date(),
    type,
    status: 'pending'
  };

  this.backups.push(backup);
  await this.save();

  // In production, trigger actual backup process
  logger.info('Backup initiated', {
    tenantId: this.tenantId,
    backupId
  });

  return backup;
};

tenantSchema.methods.applyMigration = async function(version, migration) {
  const migrationRecord = {
    version,
    appliedAt: new Date(),
    status: 'running'
  };

  this.migrations.push(migrationRecord);
  await this.save();

  try {
    const startTime = Date.now();
    await migration.up({ tenant: this });
    
    migrationRecord.status = 'completed';
    migrationRecord.duration = Date.now() - startTime;
    
  } catch (error) {
    migrationRecord.status = 'failed';
    migrationRecord.error = error.message;
    throw error;
    
  } finally {
    await this.save();
  }

  return migrationRecord;
};

tenantSchema.methods.calculateMetrics = async function() {
  // In production, calculate actual metrics
  this.metrics = {
    responseTime: {
      avg: Math.random() * 100,
      p95: Math.random() * 200,
      p99: Math.random() * 300
    },
    errorRate: Math.random() * 5,
    uptime: 99.9,
    lastCalculatedAt: new Date()
  };

  await this.save();
  return this.metrics;
};

tenantSchema.methods.runSecurityScan = async function() {
  // In production, run actual security scan
  this.security.lastSecurityScan = new Date();
  this.security.vulnerabilities = {
    critical: 0,
    high: Math.floor(Math.random() * 2),
    medium: Math.floor(Math.random() * 5),
    low: Math.floor(Math.random() * 10)
  };
  
  this.security.securityScore = this.healthScore;
  
  await this.save();
  return this.security;
};

tenantSchema.methods.extendExpiration = async function(days) {
  const currentExpiration = this.expiresAt || new Date();
  const newExpiration = new Date(currentExpiration);
  newExpiration.setDate(newExpiration.getDate() + days);
  
  this.expiresAt = newExpiration;
  await this.save();
  
  await this.audit('TENANT_EXPIRATION_EXTENDED', { 
    days,
    newExpiration 
  });
  
  return this;
};

// Private instance methods
tenantSchema.methods.#provisionDatabase = async function() {
  // Implementation would create actual database
  logger.info('Provisioning database for tenant', {
    tenantId: this.tenantId,
    databaseName: this.database.databaseName
  });
};

tenantSchema.methods.#provisionSchema = async function() {
  // Implementation would create schema structures
  logger.info('Provisioning schema for tenant', {
    tenantId: this.tenantId,
    schemaPrefix: this.database.schemaPrefix
  });
};

tenantSchema.methods.#provisionHybrid = async function() {
  // Implementation would provision based on tenant type
  if (this.type === 'enterprise') {
    await this.#provisionDatabase();
  } else {
    await this.#provisionSchema();
  }
};

// Static methods
tenantSchema.statics.findByTenantId = async function(tenantId) {
  return await this.findOne({ tenantId: tenantId.toLowerCase() });
};

tenantSchema.statics.findByOrganization = async function(organizationId) {
  return await this.find({ organizationId }).sort({ createdAt: -1 });
};

tenantSchema.statics.generateUniqueTenantId = async function(name) {
  const baseId = stringHelper.createSlug(name);
  let tenantId = baseId;
  let counter = 1;

  while (await this.exists({ tenantId })) {
    tenantId = `${baseId}${counter}`;
    counter++;
  }

  return tenantId;
};

tenantSchema.statics.getExpiringTenants = async function(days = 30) {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + days);

  return await this.find({
    status: 'active',
    expiresAt: {
      $lte: expirationDate,
      $gt: new Date()
    }
  }).sort({ expiresAt: 1 });
};

tenantSchema.statics.getTenantStatistics = async function(filters = {}) {
  const match = {};
  
  if (filters.organizationId) {
    match.organizationId = filters.organizationId;
  }

  if (filters.status) {
    match.status = filters.status;
  }

  if (filters.type) {
    match.type = filters.type;
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        suspended: {
          $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
        },
        totalUsers: { $sum: '$usage.users' },
        totalStorage: { $sum: '$usage.storage' },
        avgUsers: { $avg: '$usage.users' },
        avgStorage: { $avg: '$usage.storage' },
        byType: {
          $push: '$type'
        },
        byIsolation: {
          $push: '$isolationStrategy'
        }
      }
    },
    {
      $project: {
        _id: 0,
        total: 1,
        active: 1,
        suspended: 1,
        totalUsers: 1,
        totalStorage: 1,
        avgUsers: { $round: ['$avgUsers', 2] },
        avgStorage: { $round: ['$avgStorage', 2] },
        activeRate: {
          $multiply: [{ $divide: ['$active', '$total'] }, 100]
        }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    active: 0,
    suspended: 0,
    totalUsers: 0,
    totalStorage: 0,
    avgUsers: 0,
    avgStorage: 0,
    activeRate: 0
  };
};

tenantSchema.statics.cleanupExpiredTenants = async function() {
  const expiredTenants = await this.find({
    status: 'active',
    expiresAt: { $lt: new Date() }
  });

  const results = {
    processed: 0,
    suspended: 0,
    errors: []
  };

  for (const tenant of expiredTenants) {
    try {
      await tenant.suspend('Expired', null);
      results.suspended++;
    } catch (error) {
      results.errors.push({
        tenantId: tenant.tenantId,
        error: error.message
      });
    }
    results.processed++;
  }

  logger.info('Expired tenants cleanup completed', results);
  return results;
};

// Create and export model
const TenantModel = BaseModel.createModel('Tenant', tenantSchema);

module.exports = {
  schema: tenantSchema,
  model: TenantModel
};