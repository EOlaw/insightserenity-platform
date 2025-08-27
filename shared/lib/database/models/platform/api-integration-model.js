'use strict';

/**
 * @fileoverview API Integration model for managing external service integrations and configurations
 * @module shared/lib/database/models/platform/api-integration-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/encryption-helper
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/analytics-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const validators = require('../../../utils/validators/common-validators');
const dateHelper = require('../../../utils/helpers/date-helper');
const { EncryptionHelper } = require('../../../utils/helpers/encryption-helper');
const auditService = require('../../../security/audit/audit-service');
const analyticsService = require('../../../services/analytics-service');

/**
 * API Integration schema definition for managing external service integrations
 */
const apiIntegrationSchemaDefinition = {
  // ==================== Multi-tenancy ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  // ==================== Integration Identity ====================
  integrationId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    default: function() {
      return `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
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
    maxlength: 150
  },

  description: {
    type: String,
    maxlength: 500
  },

  // ==================== Service Provider Information ====================
  provider: {
    name: {
      type: String,
      required: true,
      enum: [
        'stripe', 'paypal', 'square', 'braintree',
        'sendgrid', 'mailgun', 'postmark', 'ses',
        'twilio', 'nexmo', 'plivo', 'messagebird',
        'slack', 'teams', 'discord', 'telegram',
        'salesforce', 'hubspot', 'pipedrive', 'zoho',
        'github', 'gitlab', 'bitbucket', 'azure_devops',
        'aws', 'gcp', 'azure', 'digitalocean',
        'google_analytics', 'mixpanel', 'amplitude', 'segment',
        'zendesk', 'intercom', 'freshdesk', 'helpscout',
        'jira', 'asana', 'trello', 'notion',
        'shopify', 'woocommerce', 'magento', 'bigcommerce',
        'custom', 'other'
      ]
    },

    version: {
      type: String,
      default: 'v1'
    },

    category: {
      type: String,
      required: true,
      enum: [
        'payment', 'email', 'sms', 'communication',
        'crm', 'analytics', 'storage', 'compute',
        'devtools', 'support', 'project_management',
        'ecommerce', 'social', 'marketing', 'other'
      ]
    },

    documentation: {
      url: String,
      version: String,
      lastUpdated: Date
    },

    support: {
      email: String,
      url: String,
      phone: String
    }
  },

  // ==================== Configuration ====================
  configuration: {
    baseUrl: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return validators.isValidUrl(v);
        },
        message: 'Invalid base URL format'
      }
    },

    endpoints: {
      type: Map,
      of: {
        url: String,
        method: {
          type: String,
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
        },
        description: String,
        timeout: {
          type: Number,
          default: 30000
        },
        retries: {
          type: Number,
          default: 3,
          min: 0,
          max: 10
        }
      }
    },

    headers: {
      type: Map,
      of: String
    },

    queryParams: {
      type: Map,
      of: String
    },

    requestFormat: {
      type: String,
      enum: ['json', 'xml', 'form', 'multipart', 'raw'],
      default: 'json'
    },

    responseFormat: {
      type: String,
      enum: ['json', 'xml', 'text', 'binary'],
      default: 'json'
    },

    timeout: {
      type: Number,
      default: 30000,
      min: 1000,
      max: 300000
    },

    retryPolicy: {
      enabled: {
        type: Boolean,
        default: true
      },
      maxAttempts: {
        type: Number,
        default: 3,
        min: 1,
        max: 10
      },
      backoffStrategy: {
        type: String,
        enum: ['linear', 'exponential', 'fixed'],
        default: 'exponential'
      },
      baseDelay: {
        type: Number,
        default: 1000
      },
      maxDelay: {
        type: Number,
        default: 30000
      },
      retryableStatusCodes: {
        type: [Number],
        default: [408, 429, 500, 502, 503, 504]
      }
    }
  },

  // ==================== Authentication ====================
  authentication: {
    type: {
      type: String,
      required: true,
      enum: ['api_key', 'bearer_token', 'oauth1', 'oauth2', 'basic_auth', 'custom', 'none']
    },

    credentials: {
      apiKey: {
        key: String,
        value: String, // Encrypted
        location: {
          type: String,
          enum: ['header', 'query', 'body'],
          default: 'header'
        }
      },

      bearerToken: {
        token: String, // Encrypted
        refreshToken: String, // Encrypted
        expiresAt: Date
      },

      oauth1: {
        consumerKey: String,
        consumerSecret: String, // Encrypted
        accessToken: String, // Encrypted
        accessTokenSecret: String // Encrypted
      },

      oauth2: {
        clientId: String,
        clientSecret: String, // Encrypted
        accessToken: String, // Encrypted
        refreshToken: String, // Encrypted
        scope: [String],
        tokenUrl: String,
        authUrl: String,
        expiresAt: Date
      },

      basicAuth: {
        username: String,
        password: String // Encrypted
      },

      custom: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      }
    },

    tokenRefresh: {
      enabled: {
        type: Boolean,
        default: false
      },
      refreshUrl: String,
      refreshBeforeExpiry: {
        type: Number,
        default: 300000 // 5 minutes
      },
      lastRefreshed: Date,
      nextRefresh: Date
    }
  },

  // ==================== Rate Limiting ====================
  rateLimiting: {
    enabled: {
      type: Boolean,
      default: true
    },

    limits: {
      requestsPerSecond: Number,
      requestsPerMinute: Number,
      requestsPerHour: Number,
      requestsPerDay: Number,
      requestsPerMonth: Number
    },

    strategy: {
      type: String,
      enum: ['token_bucket', 'sliding_window', 'fixed_window'],
      default: 'sliding_window'
    },

    backoffPolicy: {
      type: String,
      enum: ['exponential', 'linear', 'constant'],
      default: 'exponential'
    },

    quotaReset: {
      type: String,
      enum: ['rolling', 'fixed'],
      default: 'rolling'
    },

    currentUsage: {
      requestsToday: {
        type: Number,
        default: 0
      },
      requestsThisHour: {
        type: Number,
        default: 0
      },
      requestsThisMinute: {
        type: Number,
        default: 0
      },
      lastReset: Date
    }
  },

  // ==================== Webhooks ====================
  webhooks: {
    enabled: {
      type: Boolean,
      default: false
    },

    endpoints: [{
      url: {
        type: String,
        validate: {
          validator: function(v) {
            return validators.isValidUrl(v);
          },
          message: 'Invalid webhook URL format'
        }
      },
      events: [String],
      secret: String, // Encrypted
      active: {
        type: Boolean,
        default: true
      },
      retryPolicy: {
        maxAttempts: {
          type: Number,
          default: 3
        },
        backoffMultiplier: {
          type: Number,
          default: 2
        }
      },
      lastDelivery: {
        success: Boolean,
        timestamp: Date,
        statusCode: Number,
        response: String,
        error: String
      }
    }],

    security: {
      verifySignature: {
        type: Boolean,
        default: true
      },
      signatureHeader: {
        type: String,
        default: 'X-Signature'
      },
      algorithm: {
        type: String,
        enum: ['sha256', 'sha1', 'md5'],
        default: 'sha256'
      }
    }
  },

  // ==================== Status & Health ====================
  status: {
    state: {
      type: String,
      enum: ['active', 'inactive', 'testing', 'error', 'maintenance', 'deprecated'],
      default: 'testing',
      index: true
    },

    health: {
      status: {
        type: String,
        enum: ['healthy', 'degraded', 'unhealthy', 'unknown'],
        default: 'unknown'
      },
      lastCheck: Date,
      nextCheck: Date,
      checkInterval: {
        type: Number,
        default: 300000 // 5 minutes
      },
      consecutiveFailures: {
        type: Number,
        default: 0
      },
      maxFailures: {
        type: Number,
        default: 5
      }
    },

    lastUsed: Date,
    lastError: {
      timestamp: Date,
      message: String,
      statusCode: Number,
      retryable: Boolean
    },

    uptime: {
      percentage: {
        type: Number,
        min: 0,
        max: 100
      },
      totalChecks: {
        type: Number,
        default: 0
      },
      successfulChecks: {
        type: Number,
        default: 0
      }
    }
  },

  // ==================== Usage & Analytics ====================
  usage: {
    totalRequests: {
      type: Number,
      default: 0
    },

    successfulRequests: {
      type: Number,
      default: 0
    },

    failedRequests: {
      type: Number,
      default: 0
    },

    averageResponseTime: {
      type: Number,
      default: 0
    },

    lastUsageReset: Date,

    dailyStats: [{
      date: Date,
      requests: Number,
      errors: Number,
      avgResponseTime: Number,
      cost: Number
    }],

    monthlyQuota: {
      limit: Number,
      used: {
        type: Number,
        default: 0
      },
      resetDate: Date
    }
  },

  // ==================== Billing & Cost ====================
  billing: {
    enabled: {
      type: Boolean,
      default: false
    },

    model: {
      type: String,
      enum: ['per_request', 'per_transaction', 'monthly_flat', 'tiered', 'usage_based'],
      default: 'per_request'
    },

    costs: {
      setup: {
        type: Number,
        default: 0
      },
      monthly: {
        type: Number,
        default: 0
      },
      perRequest: {
        type: Number,
        default: 0
      },
      perTransaction: {
        type: Number,
        default: 0
      },
      currency: {
        type: String,
        default: 'USD'
      }
    },

    tiers: [{
      name: String,
      minRequests: Number,
      maxRequests: Number,
      pricePerRequest: Number
    }],

    currentCost: {
      thisMonth: {
        type: Number,
        default: 0
      },
      lastMonth: Number,
      thisYear: {
        type: Number,
        default: 0
      }
    },

    budgetLimits: {
      monthly: Number,
      yearly: Number,
      alertThreshold: {
        type: Number,
        default: 80 // 80%
      }
    }
  },

  // ==================== Security & Compliance ====================
  security: {
    encryption: {
      enabled: {
        type: Boolean,
        default: true
      },
      algorithm: {
        type: String,
        default: 'aes-256-gcm'
      },
      keyRotation: {
        enabled: {
          type: Boolean,
          default: false
        },
        interval: {
          type: Number,
          default: 7776000000 // 90 days
        },
        lastRotated: Date
      }
    },

    compliance: {
      requirements: [{
        type: String,
        enum: ['gdpr', 'hipaa', 'pci_dss', 'sox', 'iso27001', 'custom']
      }],
      dataResidency: String,
      auditRequired: {
        type: Boolean,
        default: true
      }
    },

    accessControl: {
      allowedIPs: [String],
      blockedIPs: [String],
      requireMFA: {
        type: Boolean,
        default: false
      },
      permissions: [{
        role: String,
        actions: [String]
      }]
    }
  },

  // ==================== Data Mapping ====================
  dataMapping: {
    requestMapping: {
      type: Map,
      of: {
        source: String,
        target: String,
        transformation: String,
        required: Boolean,
        defaultValue: mongoose.Schema.Types.Mixed
      }
    },

    responseMapping: {
      type: Map,
      of: {
        source: String,
        target: String,
        transformation: String,
        type: String
      }
    },

    errorMapping: {
      type: Map,
      of: {
        errorCode: String,
        message: String,
        retryable: Boolean,
        userMessage: String
      }
    }
  },

  // ==================== Environment & Deployment ====================
  environment: {
    current: {
      type: String,
      enum: ['development', 'staging', 'production'],
      default: 'development'
    },

    configurations: {
      development: {
        baseUrl: String,
        credentials: mongoose.Schema.Types.Mixed
      },
      staging: {
        baseUrl: String,
        credentials: mongoose.Schema.Types.Mixed
      },
      production: {
        baseUrl: String,
        credentials: mongoose.Schema.Types.Mixed
      }
    }
  },

  // ==================== Testing & Validation ====================
  testing: {
    healthCheck: {
      endpoint: String,
      expectedResponse: mongoose.Schema.Types.Mixed,
      timeout: {
        type: Number,
        default: 10000
      }
    },

    testCases: [{
      name: String,
      description: String,
      request: mongoose.Schema.Types.Mixed,
      expectedResponse: mongoose.Schema.Types.Mixed,
      lastRun: Date,
      status: {
        type: String,
        enum: ['pending', 'passed', 'failed', 'skipped']
      }
    }],

    validation: {
      enabled: {
        type: Boolean,
        default: true
      },
      rules: [{
        field: String,
        rule: String,
        value: mongoose.Schema.Types.Mixed,
        message: String
      }]
    }
  },

  // ==================== Metadata ====================
  metadata: {
    tags: [String],
    
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },

    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: Date,
      type: {
        type: String,
        enum: ['info', 'warning', 'error', 'change']
      }
    }],

    documentation: {
      internal: String,
      external: String,
      lastUpdated: Date
    },

    dependencies: [{
      integrationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ApiIntegration'
      },
      type: {
        type: String,
        enum: ['required', 'optional', 'fallback']
      },
      description: String
    }]
  },

  // ==================== Audit & Compliance ====================
  auditData: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    modifiedBy: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      at: Date,
      action: String,
      changes: mongoose.Schema.Types.Mixed
    }],

    approvals: [{
      approver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected']
      },
      comments: String
    }],

    compliance: {
      lastAudit: Date,
      nextAudit: Date,
      auditFrequency: {
        type: Number,
        default: 7776000000 // 90 days
      },
      findings: [{
        severity: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical']
        },
        description: String,
        remediation: String,
        status: {
          type: String,
          enum: ['open', 'in_progress', 'resolved']
        }
      }]
    }
  }
};

// Create schema
const apiIntegrationSchema = BaseModel.createSchema(apiIntegrationSchemaDefinition, {
  collection: 'api_integrations',
  timestamps: true
});

// ==================== Indexes ====================
apiIntegrationSchema.index({ tenantId: 1, organizationId: 1, 'status.state': 1 });
apiIntegrationSchema.index({ 'provider.name': 1, 'provider.category': 1 });
apiIntegrationSchema.index({ integrationId: 1 }, { unique: true });
apiIntegrationSchema.index({ 'status.health.status': 1, 'status.health.nextCheck': 1 });
apiIntegrationSchema.index({ 'billing.enabled': 1, organizationId: 1 });
apiIntegrationSchema.index({ 'authentication.type': 1, 'authentication.tokenRefresh.nextRefresh': 1 });
apiIntegrationSchema.index({ 'metadata.tags': 1 });
apiIntegrationSchema.index({ createdAt: -1 });

// ==================== Virtual Fields ====================
apiIntegrationSchema.virtual('isActive').get(function() {
  return this.status.state === 'active';
});

apiIntegrationSchema.virtual('isHealthy').get(function() {
  return this.status.health.status === 'healthy';
});

apiIntegrationSchema.virtual('successRate').get(function() {
  if (this.usage.totalRequests === 0) return 0;
  return (this.usage.successfulRequests / this.usage.totalRequests) * 100;
});

apiIntegrationSchema.virtual('needsTokenRefresh').get(function() {
  if (!this.authentication.tokenRefresh.enabled) return false;
  if (!this.authentication.tokenRefresh.nextRefresh) return false;
  return new Date() >= this.authentication.tokenRefresh.nextRefresh;
});

apiIntegrationSchema.virtual('isOverBudget').get(function() {
  if (!this.billing.budgetLimits.monthly) return false;
  return this.billing.currentCost.thisMonth > this.billing.budgetLimits.monthly;
});

apiIntegrationSchema.virtual('budgetUtilization').get(function() {
  if (!this.billing.budgetLimits.monthly) return 0;
  return (this.billing.currentCost.thisMonth / this.billing.budgetLimits.monthly) * 100;
});

// ==================== Pre-save Middleware ====================
apiIntegrationSchema.pre('save', async function(next) {
  try {
    // Set display name if not provided
    if (!this.displayName) {
      this.displayName = this.name;
    }

    // Encrypt sensitive credentials
    if (this.isModified('authentication.credentials') && this.authentication.credentials) {
      await this.encryptCredentials();
    }

    // Set next health check
    if (this.isModified('status.health.checkInterval') || this.isNew) {
      this.status.health.nextCheck = new Date(Date.now() + this.status.health.checkInterval);
    }

    // Set token refresh schedule
    if (this.authentication.tokenRefresh.enabled && this.authentication.credentials.oauth2?.expiresAt) {
      const refreshBefore = this.authentication.tokenRefresh.refreshBeforeExpiry;
      this.authentication.tokenRefresh.nextRefresh = new Date(
        this.authentication.credentials.oauth2.expiresAt.getTime() - refreshBefore
      );
    }

    // Update monthly quota reset date
    if (!this.usage.monthlyQuota.resetDate || this.isNew) {
      const now = new Date();
      this.usage.monthlyQuota.resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    // Add auditData trail entry
    if (!this.isNew && this.isModified()) {
      if (!this.auditData.modifiedBy) {
        this.auditData.modifiedBy = [];
      }
      
      this.auditData.modifiedBy.push({
        at: new Date(),
        action: 'update',
        changes: {
          modifiedFields: this.modifiedPaths()
        }
      });
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
apiIntegrationSchema.post('save', async function(doc) {
  try {
    // Log auditData event
    await auditService.logSecurityEvent({
      eventType: doc.isNew ? 'API_INTEGRATION_CREATED' : 'API_INTEGRATION_UPDATED',
      tenantId: doc.tenantId,
      organizationId: doc.organizationId,
      details: {
        integrationId: doc.integrationId,
        provider: doc.provider.name,
        status: doc.status.state
      }
    });

    // Update analytics
    await analyticsService.trackIntegrationEvent({
      eventType: doc.isNew ? 'integration_created' : 'integration_updated',
      integrationId: doc.integrationId,
      provider: doc.provider.name,
      organizationId: doc.organizationId
    });

    // Schedule health check if active
    if (doc.status.state === 'active' && doc.status.health.status === 'unknown') {
      setTimeout(() => {
        doc.performHealthCheck();
      }, 5000);
    }
  } catch (error) {
    logger.error('Error in API integration post-save hook', {
      error: error.message,
      integrationId: doc.integrationId
    });
  }
});

// ==================== Instance Methods ====================
apiIntegrationSchema.methods.encryptCredentials = async function() {
  const credentials = this.authentication.credentials;
  
  if (credentials.apiKey?.value) {
    credentials.apiKey.value = await EncryptionHelper.encrypt(credentials.apiKey.value);
  }
  
  if (credentials.bearerToken?.token) {
    credentials.bearerToken.token = await EncryptionHelper.encrypt(credentials.bearerToken.token);
  }
  
  if (credentials.bearerToken?.refreshToken) {
    credentials.bearerToken.refreshToken = await EncryptionHelper.encrypt(credentials.bearerToken.refreshToken);
  }
  
  if (credentials.oauth2) {
    if (credentials.oauth2.clientSecret) {
      credentials.oauth2.clientSecret = await EncryptionHelper.encrypt(credentials.oauth2.clientSecret);
    }
    if (credentials.oauth2.accessToken) {
      credentials.oauth2.accessToken = await EncryptionHelper.encrypt(credentials.oauth2.accessToken);
    }
    if (credentials.oauth2.refreshToken) {
      credentials.oauth2.refreshToken = await EncryptionHelper.encrypt(credentials.oauth2.refreshToken);
    }
  }
  
  if (credentials.basicAuth?.password) {
    credentials.basicAuth.password = await EncryptionHelper.encrypt(credentials.basicAuth.password);
  }
};

apiIntegrationSchema.methods.decryptCredentials = async function() {
  const credentials = this.authentication.credentials;
  const decrypted = JSON.parse(JSON.stringify(credentials));
  
  if (decrypted.apiKey?.value) {
    decrypted.apiKey.value = await EncryptionHelper.decrypt(decrypted.apiKey.value);
  }
  
  if (decrypted.bearerToken?.token) {
    decrypted.bearerToken.token = await EncryptionHelper.decrypt(decrypted.bearerToken.token);
  }
  
  if (decrypted.bearerToken?.refreshToken) {
    decrypted.bearerToken.refreshToken = await EncryptionHelper.decrypt(decrypted.bearerToken.refreshToken);
  }
  
  if (decrypted.oauth2) {
    if (decrypted.oauth2.clientSecret) {
      decrypted.oauth2.clientSecret = await EncryptionHelper.decrypt(decrypted.oauth2.clientSecret);
    }
    if (decrypted.oauth2.accessToken) {
      decrypted.oauth2.accessToken = await EncryptionHelper.decrypt(decrypted.oauth2.accessToken);
    }
    if (decrypted.oauth2.refreshToken) {
      decrypted.oauth2.refreshToken = await EncryptionHelper.decrypt(decrypted.oauth2.refreshToken);
    }
  }
  
  if (decrypted.basicAuth?.password) {
    decrypted.basicAuth.password = await EncryptionHelper.decrypt(decrypted.basicAuth.password);
  }
  
  return decrypted;
};

apiIntegrationSchema.methods.performHealthCheck = async function() {
  try {
    this.status.health.lastCheck = new Date();
    this.status.health.nextCheck = new Date(Date.now() + this.status.health.checkInterval);
    
    if (!this.testing.healthCheck.endpoint) {
      this.status.health.status = 'unknown';
      await this.save();
      return;
    }
    
    const startTime = Date.now();
    
    // Simulate health check request (replace with actual HTTP client)
    const response = await this.makeRequest('GET', this.testing.healthCheck.endpoint);
    
    const responseTime = Date.now() - startTime;
    
    if (response.status >= 200 && response.status < 300) {
      this.status.health.status = 'healthy';
      this.status.health.consecutiveFailures = 0;
      this.status.uptime.successfulChecks++;
    } else {
      this.status.health.status = 'unhealthy';
      this.status.health.consecutiveFailures++;
      this.status.lastError = {
        timestamp: new Date(),
        message: `Health check failed with status ${response.status}`,
        statusCode: response.status,
        retryable: response.status >= 500
      };
    }
    
    this.status.uptime.totalChecks++;
    this.status.uptime.percentage = (this.status.uptime.successfulChecks / this.status.uptime.totalChecks) * 100;
    
    // Deactivate if too many consecutive failures
    if (this.status.health.consecutiveFailures >= this.status.health.maxFailures) {
      this.status.state = 'error';
      this.status.health.status = 'unhealthy';
    }
    
    await this.save();
    
    logger.info('Health check completed', {
      integrationId: this.integrationId,
      status: this.status.health.status,
      responseTime
    });
    
    return {
      status: this.status.health.status,
      responseTime,
      timestamp: this.status.health.lastCheck
    };
    
  } catch (error) {
    this.status.health.status = 'unhealthy';
    this.status.health.consecutiveFailures++;
    this.status.lastError = {
      timestamp: new Date(),
      message: error.message,
      retryable: true
    };
    
    await this.save();
    
    logger.error('Health check failed', {
      integrationId: this.integrationId,
      error: error.message
    });
    
    throw error;
  }
};

apiIntegrationSchema.methods.makeRequest = async function(method, endpoint, data = null, options = {}) {
  // Placeholder for actual HTTP client implementation
  // This would integrate with axios, fetch, or similar HTTP client
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ status: 200, data: { success: true } });
    }, 100);
  });
};

apiIntegrationSchema.methods.refreshToken = async function() {
  if (!this.authentication.tokenRefresh.enabled) {
    throw new AppError('Token refresh not enabled', 400, 'TOKEN_REFRESH_DISABLED');
  }
  
  if (this.authentication.type !== 'oauth2') {
    throw new AppError('Token refresh only supported for OAuth2', 400, 'INVALID_AUTH_TYPE');
  }
  
  try {
    const credentials = await this.decryptCredentials();
    
    // Make token refresh request (implement with actual HTTP client)
    const response = await this.makeRequest('POST', this.authentication.credentials.oauth2.tokenUrl, {
      grant_type: 'refresh_token',
      refresh_token: credentials.oauth2.refreshToken,
      client_id: credentials.oauth2.clientId,
      client_secret: credentials.oauth2.clientSecret
    });
    
    // Update tokens
    this.authentication.credentials.oauth2.accessToken = response.data.access_token;
    this.authentication.credentials.oauth2.expiresAt = new Date(Date.now() + (response.data.expires_in * 1000));
    
    if (response.data.refresh_token) {
      this.authentication.credentials.oauth2.refreshToken = response.data.refresh_token;
    }
    
    this.authentication.tokenRefresh.lastRefreshed = new Date();
    this.authentication.tokenRefresh.nextRefresh = new Date(
      this.authentication.credentials.oauth2.expiresAt.getTime() - 
      this.authentication.tokenRefresh.refreshBeforeExpiry
    );
    
    // Re-encrypt credentials
    await this.encryptCredentials();
    await this.save();
    
    logger.info('Token refreshed successfully', {
      integrationId: this.integrationId
    });
    
    return true;
    
  } catch (error) {
    logger.error('Token refresh failed', {
      integrationId: this.integrationId,
      error: error.message
    });
    
    throw new AppError('Token refresh failed', 500, 'TOKEN_REFRESH_FAILED', {
      originalError: error.message
    });
  }
};

apiIntegrationSchema.methods.updateUsageStats = async function(requestSuccess, responseTime, cost = 0) {
  this.usage.totalRequests++;
  this.status.lastUsed = new Date();
  
  if (requestSuccess) {
    this.usage.successfulRequests++;
  } else {
    this.usage.failedRequests++;
  }
  
  // Update average response time
  const totalResponseTime = this.usage.averageResponseTime * (this.usage.totalRequests - 1);
  this.usage.averageResponseTime = (totalResponseTime + responseTime) / this.usage.totalRequests;
  
  // Update billing costs
  if (this.billing.enabled && cost > 0) {
    this.billing.currentCost.thisMonth += cost;
    this.billing.currentCost.thisYear += cost;
  }
  
  // Update rate limiting usage
  this.rateLimiting.currentUsage.requestsToday++;
  this.rateLimiting.currentUsage.requestsThisHour++;
  this.rateLimiting.currentUsage.requestsThisMinute++;
  
  // Add to daily stats
  const today = new Date().toISOString().split('T')[0];
  let dailyStat = this.usage.dailyStats.find(stat => 
    stat.date.toISOString().split('T')[0] === today
  );
  
  if (!dailyStat) {
    dailyStat = {
      date: new Date(),
      requests: 0,
      errors: 0,
      avgResponseTime: 0,
      cost: 0
    };
    this.usage.dailyStats.push(dailyStat);
  }
  
  dailyStat.requests++;
  if (!requestSuccess) dailyStat.errors++;
  dailyStat.avgResponseTime = ((dailyStat.avgResponseTime * (dailyStat.requests - 1)) + responseTime) / dailyStat.requests;
  dailyStat.cost += cost;
  
  // Keep only last 30 days of stats
  this.usage.dailyStats = this.usage.dailyStats
    .filter(stat => stat.date >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    .slice(-30);
  
  await this.save();
};

apiIntegrationSchema.methods.activate = async function(userId) {
  if (this.status.state === 'active') {
    throw new AppError('Integration already active', 400, 'ALREADY_ACTIVE');
  }
  
  // Perform health check before activation
  await this.performHealthCheck();
  
  if (this.status.health.status !== 'healthy') {
    throw new AppError('Cannot activate unhealthy integration', 400, 'UNHEALTHY_INTEGRATION');
  }
  
  this.status.state = 'active';
  
  if (!this.auditData.modifiedBy) {
    this.auditData.modifiedBy = [];
  }
  
  this.auditData.modifiedBy.push({
    user: userId,
    at: new Date(),
    action: 'activate'
  });
  
  await this.save();
  
  logger.info('Integration activated', {
    integrationId: this.integrationId,
    userId
  });
  
  return this;
};

apiIntegrationSchema.methods.deactivate = async function(userId, reason = 'Manual deactivation') {
  if (this.status.state !== 'active') {
    throw new AppError('Integration not active', 400, 'NOT_ACTIVE');
  }
  
  this.status.state = 'inactive';
  
  if (!this.auditData.modifiedBy) {
    this.auditData.modifiedBy = [];
  }
  
  this.auditData.modifiedBy.push({
    user: userId,
    at: new Date(),
    action: 'deactivate',
    changes: { reason }
  });
  
  if (!this.metadata.notes) {
    this.metadata.notes = [];
  }
  
  this.metadata.notes.push({
    content: `Deactivated: ${reason}`,
    addedBy: userId,
    addedAt: new Date(),
    type: 'change'
  });
  
  await this.save();
  
  logger.info('Integration deactivated', {
    integrationId: this.integrationId,
    reason,
    userId
  });
  
  return this;
};

// ==================== Static Methods ====================
apiIntegrationSchema.statics.findByProvider = async function(organizationId, providerName) {
  return await this.find({
    organizationId,
    'provider.name': providerName,
    'status.state': { $ne: 'deprecated' }
  }).sort({ createdAt: -1 });
};

apiIntegrationSchema.statics.findActiveIntegrations = async function(organizationId) {
  return await this.find({
    organizationId,
    'status.state': 'active',
    'status.health.status': { $in: ['healthy', 'degraded'] }
  }).sort({ 'status.lastUsed': -1 });
};

apiIntegrationSchema.statics.getIntegrationsByCategory = async function(organizationId, category) {
  return await this.find({
    organizationId,
    'provider.category': category
  }).sort({ name: 1 });
};

apiIntegrationSchema.statics.performBulkHealthCheck = async function(organizationId) {
  const integrations = await this.find({
    organizationId,
    'status.state': 'active',
    'status.health.nextCheck': { $lte: new Date() }
  });
  
  const results = [];
  
  for (const integration of integrations) {
    try {
      const result = await integration.performHealthCheck();
      results.push({
        integrationId: integration.integrationId,
        status: 'success',
        health: result
      });
    } catch (error) {
      results.push({
        integrationId: integration.integrationId,
        status: 'error',
        error: error.message
      });
    }
  }
  
  logger.info('Bulk health check completed', {
    organizationId,
    totalChecked: integrations.length,
    successful: results.filter(r => r.status === 'success').length
  });
  
  return results;
};

apiIntegrationSchema.statics.getUsageStatistics = async function(organizationId, period = 'month') {
  const startDate = dateHelper.subtractPeriod(new Date(), 1, period);
  
  const stats = await this.aggregate([
    {
      $match: {
        organizationId,
        'status.lastUsed': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$provider.category',
        totalRequests: { $sum: '$usage.totalRequests' },
        totalCost: { $sum: '$billing.currentCost.thisMonth' },
        integrationCount: { $sum: 1 },
        avgSuccessRate: { $avg: { $divide: ['$usage.successfulRequests', '$usage.totalRequests'] } },
        avgResponseTime: { $avg: '$usage.averageResponseTime' }
      }
    },
    {
      $sort: { totalRequests: -1 }
    }
  ]);
  
  return stats;
};

apiIntegrationSchema.statics.findIntegrationsNeedingAttention = async function(organizationId) {
  const now = new Date();
  
  return await this.find({
    organizationId,
    $or: [
      { 'status.health.status': 'unhealthy' },
      { 'status.health.consecutiveFailures': { $gte: 3 } },
      { 'authentication.tokenRefresh.nextRefresh': { $lte: now } },
      { 'billing.currentCost.thisMonth': { $gt: '$billing.budgetLimits.monthly' } },
      { 'status.health.nextCheck': { $lte: now } }
    ]
  }).sort({ 'status.lastError.timestamp': -1 });
};

// Create and export model
const ApiIntegrationModel = BaseModel.createModel('ApiIntegration', apiIntegrationSchema);

module.exports = ApiIntegrationModel;