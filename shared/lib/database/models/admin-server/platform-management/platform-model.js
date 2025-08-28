'use strict';

/**
 * @fileoverview Platform configuration and settings model
 * @module servers/admin-server/modules/platform-management/models/platform-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../base-model');
const logger = require('../../../../utils/logger');
const { AppError } = require('../../../../utils/app-error');
const EncryptionService = require('../../../../security/encryption/encryption-service');

/**
 * @typedef {Object} FeatureFlag
 * @property {string} name - Feature flag identifier
 * @property {boolean} enabled - Global enablement status
 * @property {string} description - Feature description
 * @property {Array<string>} enabledTenants - Specific tenant IDs where enabled
 * @property {Array<string>} disabledTenants - Specific tenant IDs where disabled
 * @property {Object} rolloutPercentage - Gradual rollout configuration
 * @property {number} rolloutPercentage.percentage - Percentage of users/tenants
 * @property {string} rolloutPercentage.strategy - Rollout strategy (random|sequential|custom)
 * @property {Object} metadata - Additional feature metadata
 * @property {Date} enabledSince - When feature was first enabled
 * @property {Date} lastModified - Last modification timestamp
 * @property {string} modifiedBy - User ID who last modified
 */

/**
 * @typedef {Object} SystemModule
 * @property {string} name - Module identifier
 * @property {string} version - Current module version
 * @property {boolean} enabled - Module activation status
 * @property {Object} configuration - Module-specific settings
 * @property {Array<string>} dependencies - Required module dependencies
 * @property {Object} health - Module health status
 * @property {string} health.status - Current status (healthy|degraded|unhealthy)
 * @property {Date} health.lastCheck - Last health check timestamp
 * @property {Object} health.metrics - Health metrics
 * @property {Object} licensing - Module licensing information
 * @property {string} licensing.type - License type
 * @property {Date} licensing.expiresAt - License expiration
 * @property {number} licensing.maxUsers - Maximum allowed users
 */

/**
 * @typedef {Object} DeploymentInfo
 * @property {string} version - Platform version
 * @property {string} environment - Deployment environment
 * @property {Date} deployedAt - Deployment timestamp
 * @property {string} deployedBy - Deployer user ID
 * @property {string} commitHash - Git commit hash
 * @property {string} branch - Git branch name
 * @property {Object} buildInfo - Build information
 * @property {string} buildInfo.number - Build number
 * @property {Date} buildInfo.timestamp - Build timestamp
 * @property {string} buildInfo.machine - Build machine identifier
 * @property {Array<Object>} rollbackHistory - Previous deployments
 */

/**
 * @typedef {Object} SecurityConfiguration
 * @property {Object} authentication - Auth settings
 * @property {Array<string>} authentication.providers - Enabled auth providers
 * @property {Object} authentication.sessionConfig - Session configuration
 * @property {number} authentication.sessionConfig.timeout - Session timeout in minutes
 * @property {boolean} authentication.sessionConfig.sliding - Sliding session renewal
 * @property {Object} authentication.passwordPolicy - Password requirements
 * @property {Object} authorization - Authorization settings
 * @property {string} authorization.model - Auth model (RBAC|ABAC|custom)
 * @property {boolean} authorization.cacheEnabled - Permission caching
 * @property {Object} encryption - Encryption settings
 * @property {string} encryption.algorithm - Encryption algorithm
 * @property {number} encryption.keyRotationDays - Key rotation interval
 * @property {Object} rateLimit - Rate limiting configuration
 * @property {Object} cors - CORS configuration
 */

/**
 * @typedef {Object} MaintenanceWindow
 * @property {string} id - Window identifier
 * @property {string} type - Maintenance type (scheduled|emergency)
 * @property {Date} startTime - Maintenance start time
 * @property {Date} endTime - Maintenance end time
 * @property {string} description - Maintenance description
 * @property {Array<string>} affectedServices - Services affected
 * @property {boolean} requiresDowntime - Whether downtime is required
 * @property {string} status - Window status (scheduled|in-progress|completed|cancelled)
 * @property {Object} notifications - Notification settings
 * @property {boolean} notifications.enabled - Whether to send notifications
 * @property {Array<number>} notifications.advanceMinutes - Minutes before to notify
 * @property {string} createdBy - Creator user ID
 * @property {Date} createdAt - Creation timestamp
 */

/**
 * Platform configuration schema definition
 */
const platformConfigurationSchemaDefinition = {
  // Platform Identity
  platformId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => `PLATFORM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    description: 'Unique platform instance identifier'
  },

  platformName: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 100,
    description: 'Platform display name'
  },

  platformDescription: {
    type: String,
    trim: true,
    maxlength: 500,
    description: 'Platform description and purpose'
  },

  // Feature Management
  featureFlags: [{
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9_-]+$/,
      description: 'Feature flag identifier'
    },
    enabled: {
      type: Boolean,
      default: false,
      description: 'Global feature enablement'
    },
    description: {
      type: String,
      trim: true,
      description: 'Feature description'
    },
    enabledTenants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      description: 'Tenants with feature enabled'
    }],
    disabledTenants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      description: 'Tenants with feature disabled'
    }],
    rolloutPercentage: {
      percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
        description: 'Rollout percentage'
      },
      strategy: {
        type: String,
        enum: ['random', 'sequential', 'custom'],
        default: 'random',
        description: 'Rollout strategy'
      },
      customCriteria: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Custom rollout criteria'
      }
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      description: 'Additional feature metadata'
    },
    enabledSince: {
      type: Date,
      description: 'When feature was first enabled'
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

  // System Modules
  systemModules: [{
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      description: 'Module identifier'
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      description: 'Module display name'
    },
    version: {
      type: String,
      required: true,
      match: /^\d+\.\d+\.\d+$/,
      description: 'Module version (semver)'
    },
    enabled: {
      type: Boolean,
      default: true,
      description: 'Module activation status'
    },
    configuration: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      description: 'Module-specific configuration'
    },
    dependencies: [{
      type: String,
      description: 'Required module dependencies'
    }],
    health: {
      status: {
        type: String,
        enum: ['healthy', 'degraded', 'unhealthy', 'unknown'],
        default: 'unknown',
        description: 'Module health status'
      },
      lastCheck: {
        type: Date,
        description: 'Last health check timestamp'
      },
      metrics: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
        description: 'Health metrics'
      },
      errors: [{
        timestamp: Date,
        message: String,
        code: String,
        severity: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical']
        }
      }]
    },
    licensing: {
      type: {
        type: String,
        enum: ['free', 'basic', 'professional', 'enterprise', 'custom'],
        default: 'free',
        description: 'License type'
      },
      expiresAt: {
        type: Date,
        description: 'License expiration'
      },
      maxUsers: {
        type: Number,
        description: 'Maximum allowed users'
      },
      features: [{
        type: String,
        description: 'Licensed features'
      }],
      restrictions: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
        description: 'License restrictions'
      }
    },
    installedAt: {
      type: Date,
      default: Date.now,
      description: 'Module installation timestamp'
    },
    lastUpdated: {
      type: Date,
      description: 'Last update timestamp'
    }
  }],

  // Deployment Information
  deployment: {
    version: {
      type: String,
      required: true,
      match: /^\d+\.\d+\.\d+$/,
      description: 'Platform version'
    },
    environment: {
      type: String,
      required: true,
      enum: ['development', 'staging', 'production', 'testing'],
      description: 'Deployment environment'
    },
    deployedAt: {
      type: Date,
      required: true,
      default: Date.now,
      description: 'Deployment timestamp'
    },
    deployedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'Deployer user ID'
    },
    commitHash: {
      type: String,
      match: /^[a-f0-9]{40}$/,
      description: 'Git commit hash'
    },
    branch: {
      type: String,
      description: 'Git branch name'
    },
    buildInfo: {
      number: {
        type: String,
        description: 'Build number'
      },
      timestamp: {
        type: Date,
        description: 'Build timestamp'
      },
      machine: {
        type: String,
        description: 'Build machine identifier'
      },
      duration: {
        type: Number,
        description: 'Build duration in seconds'
      }
    },
    rollbackHistory: [{
      version: String,
      deployedAt: Date,
      deployedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      rolledBackAt: Date,
      rolledBackBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: String
    }]
  },

  // Security Configuration
  security: {
    authentication: {
      providers: [{
        type: String,
        enum: ['local', 'ldap', 'saml', 'oauth', 'oidc', 'github', 'google', 'linkedin'],
        description: 'Enabled auth providers'
      }],
      sessionConfig: {
        timeout: {
          type: Number,
          default: 30,
          min: 5,
          max: 1440,
          description: 'Session timeout in minutes'
        },
        sliding: {
          type: Boolean,
          default: true,
          description: 'Sliding session renewal'
        },
        maxConcurrent: {
          type: Number,
          default: 5,
          min: 1,
          description: 'Max concurrent sessions per user'
        },
        rememberMeDuration: {
          type: Number,
          default: 30,
          description: 'Remember me duration in days'
        }
      },
      passwordPolicy: {
        minLength: {
          type: Number,
          default: 8,
          min: 6,
          max: 128,
          description: 'Minimum password length'
        },
        requireUppercase: {
          type: Boolean,
          default: true,
          description: 'Require uppercase letters'
        },
        requireLowercase: {
          type: Boolean,
          default: true,
          description: 'Require lowercase letters'
        },
        requireNumbers: {
          type: Boolean,
          default: true,
          description: 'Require numeric characters'
        },
        requireSpecialChars: {
          type: Boolean,
          default: true,
          description: 'Require special characters'
        },
        preventReuse: {
          type: Number,
          default: 5,
          min: 0,
          max: 24,
          description: 'Number of previous passwords to prevent reuse'
        },
        expirationDays: {
          type: Number,
          default: 90,
          min: 0,
          description: 'Password expiration in days (0 = never)'
        }
      },
      twoFactor: {
        required: {
          type: Boolean,
          default: false,
          description: 'Require 2FA for all users'
        },
        methods: [{
          type: String,
          enum: ['totp', 'sms', 'email', 'backup-codes'],
          description: 'Allowed 2FA methods'
        }],
        gracePeriodDays: {
          type: Number,
          default: 7,
          description: 'Grace period before 2FA enforcement'
        }
      }
    },
    authorization: {
      model: {
        type: String,
        enum: ['RBAC', 'ABAC', 'custom'],
        default: 'RBAC',
        description: 'Authorization model'
      },
      cacheEnabled: {
        type: Boolean,
        default: true,
        description: 'Enable permission caching'
      },
      cacheTTL: {
        type: Number,
        default: 300,
        description: 'Cache TTL in seconds'
      },
      defaultRoles: [{
        type: String,
        description: 'Default roles for new users'
      }]
    },
    encryption: {
      algorithm: {
        type: String,
        enum: ['AES-256-GCM', 'AES-256-CBC', 'ChaCha20-Poly1305'],
        default: 'AES-256-GCM',
        description: 'Encryption algorithm'
      },
      keyRotationDays: {
        type: Number,
        default: 90,
        min: 30,
        description: 'Key rotation interval in days'
      },
      enabledForFields: [{
        type: String,
        description: 'Fields to encrypt at rest'
      }]
    },
    rateLimit: {
      enabled: {
        type: Boolean,
        default: true,
        description: 'Enable rate limiting'
      },
      windowMs: {
        type: Number,
        default: 900000, // 15 minutes
        description: 'Rate limit window in milliseconds'
      },
      maxRequests: {
        type: Number,
        default: 100,
        description: 'Max requests per window'
      },
      skipSuccessfulRequests: {
        type: Boolean,
        default: false,
        description: 'Skip counting successful requests'
      },
      customRules: [{
        path: String,
        method: String,
        maxRequests: Number,
        windowMs: Number
      }]
    },
    cors: {
      enabled: {
        type: Boolean,
        default: true,
        description: 'Enable CORS'
      },
      origins: [{
        type: String,
        description: 'Allowed origins'
      }],
      credentials: {
        type: Boolean,
        default: true,
        description: 'Allow credentials'
      },
      maxAge: {
        type: Number,
        default: 86400,
        description: 'Preflight cache duration'
      }
    },
    ipWhitelist: {
      enabled: {
        type: Boolean,
        default: false,
        description: 'Enable IP whitelisting'
      },
      addresses: [{
        type: String,
        match: /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/,
        description: 'Whitelisted IP addresses/ranges'
      }],
      exemptPaths: [{
        type: String,
        description: 'Paths exempt from IP restrictions'
      }]
    }
  },

  // Performance Configuration
  performance: {
    caching: {
      enabled: {
        type: Boolean,
        default: true,
        description: 'Enable caching'
      },
      provider: {
        type: String,
        enum: ['memory', 'redis', 'memcached'],
        default: 'redis',
        description: 'Cache provider'
      },
      defaultTTL: {
        type: Number,
        default: 3600,
        description: 'Default cache TTL in seconds'
      },
      maxSize: {
        type: Number,
        default: 1000,
        description: 'Max cache entries'
      }
    },
    database: {
      connectionPoolSize: {
        type: Number,
        default: 10,
        min: 5,
        max: 100,
        description: 'DB connection pool size'
      },
      queryTimeout: {
        type: Number,
        default: 30000,
        description: 'Query timeout in milliseconds'
      },
      enableQueryLogging: {
        type: Boolean,
        default: false,
        description: 'Enable query logging'
      },
      slowQueryThreshold: {
        type: Number,
        default: 1000,
        description: 'Slow query threshold in ms'
      }
    },
    monitoring: {
      enabled: {
        type: Boolean,
        default: true,
        description: 'Enable performance monitoring'
      },
      samplingRate: {
        type: Number,
        default: 0.1,
        min: 0,
        max: 1,
        description: 'Transaction sampling rate'
      },
      customMetrics: [{
        name: String,
        type: {
          type: String,
          enum: ['counter', 'gauge', 'histogram']
        },
        description: String
      }]
    }
  },

  // Notification Settings
  notifications: {
    channels: {
      email: {
        enabled: {
          type: Boolean,
          default: true
        },
        provider: {
          type: String,
          enum: ['sendgrid', 'mailgun', 'ses', 'smtp'],
          default: 'sendgrid'
        },
        fromAddress: {
          type: String,
          match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        },
        replyToAddress: {
          type: String,
          match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        }
      },
      sms: {
        enabled: {
          type: Boolean,
          default: false
        },
        provider: {
          type: String,
          enum: ['twilio', 'nexmo', 'sns']
        },
        fromNumber: String
      },
      push: {
        enabled: {
          type: Boolean,
          default: false
        },
        provider: {
          type: String,
          enum: ['fcm', 'apns', 'onesignal']
        }
      },
      webhook: {
        enabled: {
          type: Boolean,
          default: true
        },
        defaultTimeout: {
          type: Number,
          default: 5000
        },
        retryAttempts: {
          type: Number,
          default: 3
        }
      }
    },
    templates: [{
      name: {
        type: String,
        required: true,
        unique: true
      },
      channel: {
        type: String,
        enum: ['email', 'sms', 'push'],
        required: true
      },
      subject: String,
      body: {
        type: String,
        required: true
      },
      variables: [{
        type: String
      }],
      enabled: {
        type: Boolean,
        default: true
      }
    }],
    adminAlerts: {
      systemErrors: {
        type: Boolean,
        default: true
      },
      securityEvents: {
        type: Boolean,
        default: true
      },
      performanceIssues: {
        type: Boolean,
        default: true
      },
      maintenanceReminders: {
        type: Boolean,
        default: true
      },
      recipients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }
  },

  // API Configuration
  api: {
    versioning: {
      strategy: {
        type: String,
        enum: ['url', 'header', 'accept'],
        default: 'url'
      },
      currentVersion: {
        type: String,
        default: 'v1'
      },
      supportedVersions: [{
        type: String
      }],
      deprecatedVersions: [{
        version: String,
        deprecatedAt: Date,
        sunsetDate: Date
      }]
    },
    documentation: {
      enabled: {
        type: Boolean,
        default: true
      },
      provider: {
        type: String,
        enum: ['swagger', 'redoc', 'custom'],
        default: 'swagger'
      },
      path: {
        type: String,
        default: '/api-docs'
      },
      requireAuth: {
        type: Boolean,
        default: false
      }
    },
    pagination: {
      defaultLimit: {
        type: Number,
        default: 20,
        min: 1,
        max: 100
      },
      maxLimit: {
        type: Number,
        default: 100,
        min: 1,
        max: 1000
      }
    },
    compression: {
      enabled: {
        type: Boolean,
        default: true
      },
      threshold: {
        type: Number,
        default: 1024
      }
    }
  },

  // Maintenance Windows
  maintenanceWindows: [{
    id: {
      type: String,
      default: () => `MW_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    },
    type: {
      type: String,
      enum: ['scheduled', 'emergency'],
      required: true
    },
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    affectedServices: [{
      type: String
    }],
    requiresDowntime: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
      default: 'scheduled'
    },
    notifications: {
      enabled: {
        type: Boolean,
        default: true
      },
      advanceMinutes: [{
        type: Number,
        default: [1440, 60, 15] // 24h, 1h, 15m
      }],
      sentAt: [{
        minutes: Number,
        timestamp: Date
      }]
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    completedAt: Date,
    notes: String
  }],

  // Integration Settings
  integrations: {
    oauth: [{
      provider: {
        type: String,
        required: true
      },
      clientId: {
        type: String,
        required: true
      },
      clientSecret: {
        type: String,
        required: true,
        select: false
      },
      scopes: [{
        type: String
      }],
      redirectUri: String,
      enabled: {
        type: Boolean,
        default: true
      }
    }],
    webhooks: {
      signing: {
        enabled: {
          type: Boolean,
          default: true
        },
        algorithm: {
          type: String,
          enum: ['hmac-sha256', 'hmac-sha512'],
          default: 'hmac-sha256'
        }
      },
      retry: {
        maxAttempts: {
          type: Number,
          default: 3
        },
        backoffMultiplier: {
          type: Number,
          default: 2
        },
        initialDelay: {
          type: Number,
          default: 1000
        }
      }
    },
    apis: [{
      name: {
        type: String,
        required: true
      },
      baseUrl: {
        type: String,
        required: true
      },
      apiKey: {
        type: String,
        select: false
      },
      timeout: {
        type: Number,
        default: 30000
      },
      rateLimit: {
        requests: Number,
        windowMs: Number
      },
      enabled: {
        type: Boolean,
        default: true
      }
    }]
  },

  // Platform Metadata
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },

  // Platform Status
  status: {
    operational: {
      type: Boolean,
      default: true
    },
    lastHealthCheck: {
      type: Date,
      default: Date.now
    },
    healthScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    issues: [{
      id: String,
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      },
      component: String,
      description: String,
      detectedAt: Date,
      resolvedAt: Date,
      acknowledgedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  }
};

const platformConfigurationSchema = BaseModel.createSchema(platformConfigurationSchemaDefinition, {
  collection: 'platform_configurations',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// Indexes
platformConfigurationSchema.index({ platformId: 1 }, { unique: true });
platformConfigurationSchema.index({ 'featureFlags.name': 1 });
platformConfigurationSchema.index({ 'systemModules.name': 1 });
platformConfigurationSchema.index({ 'deployment.version': 1, 'deployment.environment': 1 });
platformConfigurationSchema.index({ 'maintenanceWindows.startTime': 1, 'maintenanceWindows.endTime': 1 });
platformConfigurationSchema.index({ 'status.operational': 1 });
platformConfigurationSchema.index({ createdAt: -1 });

// Virtual properties
platformConfigurationSchema.virtual('isInMaintenance').get(function() {
  const now = new Date();
  return this.maintenanceWindows.some(window => 
    window.status === 'in-progress' ||
    (window.status === 'scheduled' && window.startTime <= now && window.endTime >= now)
  );
});

platformConfigurationSchema.virtual('activeFeatures').get(function() {
  return this.featureFlags.filter(flag => flag.enabled).map(flag => flag.name);
});

platformConfigurationSchema.virtual('healthStatus').get(function() {
  if (!this.status.operational) return 'offline';
  if (this.status.healthScore >= 90) return 'healthy';
  if (this.status.healthScore >= 70) return 'degraded';
  return 'unhealthy';
});

// Instance methods
platformConfigurationSchema.methods.enableFeature = async function(featureName, options = {}) {
  try {
    const feature = this.featureFlags.find(f => f.name === featureName);
    
    if (!feature) {
      this.featureFlags.push({
        name: featureName,
        enabled: true,
        description: options.description || '',
        enabledSince: new Date(),
        modifiedBy: options.modifiedBy
      });
    } else {
      feature.enabled = true;
      feature.enabledSince = feature.enabledSince || new Date();
      feature.lastModified = new Date();
      feature.modifiedBy = options.modifiedBy;
    }

    await this.save();
    
    logger.info('Feature enabled', {
      platformId: this.platformId,
      featureName,
      modifiedBy: options.modifiedBy
    });

    return this;
  } catch (error) {
    logger.error('Failed to enable feature', {
      platformId: this.platformId,
      featureName,
      error: error.message
    });
    throw new AppError(`Failed to enable feature: ${error.message}`, 500);
  }
};

platformConfigurationSchema.methods.disableFeature = async function(featureName, options = {}) {
  try {
    const feature = this.featureFlags.find(f => f.name === featureName);
    
    if (!feature) {
      throw new AppError(`Feature '${featureName}' not found`, 404);
    }

    feature.enabled = false;
    feature.lastModified = new Date();
    feature.modifiedBy = options.modifiedBy;

    await this.save();
    
    logger.info('Feature disabled', {
      platformId: this.platformId,
      featureName,
      modifiedBy: options.modifiedBy
    });

    return this;
  } catch (error) {
    logger.error('Failed to disable feature', {
      platformId: this.platformId,
      featureName,
      error: error.message
    });
    throw error instanceof AppError ? error : new AppError(`Failed to disable feature: ${error.message}`, 500);
  }
};

platformConfigurationSchema.methods.isFeatureEnabledForTenant = function(featureName, tenantId) {
  const feature = this.featureFlags.find(f => f.name === featureName);
  
  if (!feature) return false;
  
  // Check if globally disabled
  if (!feature.enabled) {
    // But check if specifically enabled for this tenant
    return feature.enabledTenants.some(id => id.toString() === tenantId.toString());
  }
  
  // Check if specifically disabled for this tenant
  if (feature.disabledTenants.some(id => id.toString() === tenantId.toString())) {
    return false;
  }
  
  // Check rollout percentage
  if (feature.rolloutPercentage && feature.rolloutPercentage.percentage < 100) {
    // Implement consistent hashing for deterministic rollout
    const hash = require('crypto')
      .createHash('md5')
      .update(`${featureName}-${tenantId}`)
      .digest('hex');
    const hashValue = parseInt(hash.substr(0, 8), 16);
    const percentage = (hashValue % 100) + 1;
    
    return percentage <= feature.rolloutPercentage.percentage;
  }
  
  return true;
};

platformConfigurationSchema.methods.scheduleMaintenance = async function(maintenanceData) {
  try {
    const maintenance = {
      id: `MW_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...maintenanceData,
      status: 'scheduled',
      createdAt: new Date()
    };

    // Validate maintenance window
    if (maintenance.startTime >= maintenance.endTime) {
      throw new AppError('Maintenance end time must be after start time', 400);
    }

    // Check for overlapping maintenance windows
    const hasOverlap = this.maintenanceWindows.some(window => 
      window.status !== 'cancelled' &&
      window.status !== 'completed' &&
      (
        (maintenance.startTime >= window.startTime && maintenance.startTime < window.endTime) ||
        (maintenance.endTime > window.startTime && maintenance.endTime <= window.endTime) ||
        (maintenance.startTime <= window.startTime && maintenance.endTime >= window.endTime)
      )
    );

    if (hasOverlap) {
      throw new AppError('Maintenance window overlaps with existing window', 409);
    }

    this.maintenanceWindows.push(maintenance);
    await this.save();

    logger.info('Maintenance scheduled', {
      platformId: this.platformId,
      maintenanceId: maintenance.id,
      startTime: maintenance.startTime,
      endTime: maintenance.endTime
    });

    return maintenance;
  } catch (error) {
    logger.error('Failed to schedule maintenance', {
      platformId: this.platformId,
      error: error.message
    });
    throw error instanceof AppError ? error : new AppError(`Failed to schedule maintenance: ${error.message}`, 500);
  }
};

platformConfigurationSchema.methods.updateSystemModule = async function(moduleName, updates) {
  try {
    const module = this.systemModules.find(m => m.name === moduleName);
    
    if (!module) {
      throw new AppError(`System module '${moduleName}' not found`, 404);
    }

    // Update allowed fields
    const allowedUpdates = ['enabled', 'configuration', 'version', 'health'];
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        if (key === 'health') {
          module.health = { ...module.health, ...updates[key] };
        } else {
          module[key] = updates[key];
        }
      }
    });

    module.lastUpdated = new Date();
    await this.save();

    logger.info('System module updated', {
      platformId: this.platformId,
      moduleName,
      updates: Object.keys(updates)
    });

    return module;
  } catch (error) {
    logger.error('Failed to update system module', {
      platformId: this.platformId,
      moduleName,
      error: error.message
    });
    throw error instanceof AppError ? error : new AppError(`Failed to update system module: ${error.message}`, 500);
  }
};

platformConfigurationSchema.methods.recordDeployment = async function(deploymentInfo) {
  try {
    // Archive current deployment to rollback history
    if (this.deployment.version) {
      this.deployment.rollbackHistory.push({
        version: this.deployment.version,
        deployedAt: this.deployment.deployedAt,
        deployedBy: this.deployment.deployedBy
      });

      // Keep only last 10 rollback entries
      if (this.deployment.rollbackHistory.length > 10) {
        this.deployment.rollbackHistory = this.deployment.rollbackHistory.slice(-10);
      }
    }

    // Update deployment info
    this.deployment = {
      ...this.deployment.toObject(),
      ...deploymentInfo,
      deployedAt: new Date()
    };

    await this.save();

    logger.info('Deployment recorded', {
      platformId: this.platformId,
      version: deploymentInfo.version,
      environment: deploymentInfo.environment
    });

    return this.deployment;
  } catch (error) {
    logger.error('Failed to record deployment', {
      platformId: this.platformId,
      error: error.message
    });
    throw new AppError(`Failed to record deployment: ${error.message}`, 500);
  }
};

platformConfigurationSchema.methods.performHealthCheck = async function() {
  try {
    const healthMetrics = {
      modules: {},
      overall: 100,
      issues: []
    };

    // Check system modules
    for (const module of this.systemModules) {
      if (module.enabled) {
        // Simulate health check (in production, this would call actual health endpoints)
        const moduleHealth = await this.checkModuleHealth(module);
        healthMetrics.modules[module.name] = moduleHealth;
        
        if (moduleHealth.status !== 'healthy') {
          healthMetrics.overall -= 10;
          healthMetrics.issues.push({
            component: module.name,
            severity: moduleHealth.status === 'unhealthy' ? 'high' : 'medium',
            description: `Module ${module.name} is ${moduleHealth.status}`
          });
        }
      }
    }

    // Update platform status
    this.status.lastHealthCheck = new Date();
    this.status.healthScore = Math.max(0, healthMetrics.overall);
    
    // Add new issues
    for (const issue of healthMetrics.issues) {
      const existingIssue = this.status.issues.find(i => 
        i.component === issue.component && !i.resolvedAt
      );
      
      if (!existingIssue) {
        this.status.issues.push({
          id: `ISSUE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ...issue,
          detectedAt: new Date()
        });
      }
    }

    await this.save();

    return healthMetrics;
  } catch (error) {
    logger.error('Failed to perform health check', {
      platformId: this.platformId,
      error: error.message
    });
    throw new AppError(`Failed to perform health check: ${error.message}`, 500);
  }
};

// Change the checkModuleHealth method to a private method by adding a # prefix
platformConfigurationSchema.methods.checkModuleHealth = async function(module) {
  // This is a placeholder for actual health check logic
  // In production, this would make HTTP calls to health endpoints
  const randomHealth = Math.random();
  
  if (randomHealth > 0.9) {
    return { status: 'unhealthy', message: 'Module is not responding' };
  } else if (randomHealth > 0.8) {
    return { status: 'degraded', message: 'Module is experiencing high latency' };
  }
  
  return { status: 'healthy', message: 'Module is operating normally' };
};

// Static methods
platformConfigurationSchema.statics.findByEnvironment = function(environment) {
  return this.findOne({ 'deployment.environment': environment });
};

platformConfigurationSchema.statics.getActiveMaintenanceWindows = function() {
  const now = new Date();
  return this.find({
    'maintenanceWindows': {
      $elemMatch: {
        status: { $in: ['scheduled', 'in-progress'] },
        startTime: { $lte: now },
        endTime: { $gte: now }
      }
    }
  });
};

platformConfigurationSchema.statics.findByFeature = function(featureName) {
  return this.find({
    'featureFlags': {
      $elemMatch: {
        name: featureName,
        enabled: true
      }
    }
  });
};

// Middleware
platformConfigurationSchema.pre('save', function(next) {
  // Update lastModifiedBy in metadata
  if (this.isModified() && !this.isNew) {
    this.metadata.lastModifiedBy = this._lastModifiedBy || this.metadata.createdBy;
  }

  // Validate maintenance windows
  for (const window of this.maintenanceWindows) {
    if (window.startTime >= window.endTime) {
      return next(new Error('Maintenance window end time must be after start time'));
    }
  }

  // Validate feature flags
  const featureNames = new Set();
  for (const flag of this.featureFlags) {
    if (featureNames.has(flag.name)) {
      return next(new Error(`Duplicate feature flag: ${flag.name}`));
    }
    featureNames.add(flag.name);
  }

  // Validate system modules
  const moduleNames = new Set();
  for (const module of this.systemModules) {
    if (moduleNames.has(module.name)) {
      return next(new Error(`Duplicate system module: ${module.name}`));
    }
    moduleNames.add(module.name);
  }

  next();
});

platformConfigurationSchema.post('save', function(doc) {
  logger.info('Platform configuration saved', {
    platformId: doc.platformId,
    environment: doc.deployment.environment
  });
});

platformConfigurationSchema.pre('findOneAndUpdate', function() {
  this.set({ 'metadata.lastModifiedBy': this.getOptions()._lastModifiedBy });
});

// Encryption for sensitive fields
platformConfigurationSchema.pre('save', async function(next) {
  try {
    const encryptionService = new EncryptionService();

    // Encrypt OAuth secrets
    if (this.isModified('integrations.oauth')) {
      for (const oauth of this.integrations.oauth) {
        if (oauth.clientSecret && !oauth.clientSecret.startsWith('enc:')) {
          oauth.clientSecret = await encryptionService.encrypt(oauth.clientSecret);
        }
      }
    }

    // Encrypt API keys
    if (this.isModified('integrations.apis')) {
      for (const api of this.integrations.apis) {
        if (api.apiKey && !api.apiKey.startsWith('enc:')) {
          api.apiKey = await encryptionService.encrypt(api.apiKey);
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Decrypt sensitive fields when retrieving
platformConfigurationSchema.post('init', async function() {
  try {
    const encryptionService = new EncryptionService();

    // Decrypt OAuth secrets
    if (this.integrations && this.integrations.oauth) {
      for (const oauth of this.integrations.oauth) {
        if (oauth.clientSecret && oauth.clientSecret.startsWith('enc:')) {
          oauth.clientSecret = await encryptionService.decrypt(oauth.clientSecret);
        }
      }
    }

    // Decrypt API keys
    if (this.integrations && this.integrations.apis) {
      for (const api of this.integrations.apis) {
        if (api.apiKey && api.apiKey.startsWith('enc:')) {
          api.apiKey = await encryptionService.decrypt(api.apiKey);
        }
      }
    }
  } catch (error) {
    logger.error('Failed to decrypt sensitive fields', {
      platformId: this.platformId,
      error: error.message
    });
  }
});

// ==================== Create Model ====================
const PlatformConfigurationModel = BaseModel.createModel('PlatformConfiguration', platformConfigurationSchema, {
  enableTimestamps: true,
  enableAudit: true
});

module.exports = PlatformConfigurationModel;

// {
//   collection: 'platform_configurations',
//   strict: true,
//   timestamps: true
// }