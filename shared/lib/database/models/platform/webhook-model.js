'use strict';

/**
 * @fileoverview Webhook model for third-party integrations and event delivery
 * @module shared/lib/database/models/platform/webhook-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/webhook-service
 * @requires module:shared/lib/security/encryption/hash-service
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/helpers/crypto-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const webhookService = require('../../../services/webhook-service');
const hashService = require('../../../security/encryption/hash-service');
const stringHelper = require('../../../utils/helpers/string-helper');
const CommonValidator = require('../../../utils/validators/common-validators');
const auditService = require('../../../security/audit/audit-service');
const cryptoHelper = require('../../../utils/helpers/crypto-helper');

/**
 * Webhook schema definition for managing event subscriptions and deliveries
 */
const webhookSchemaDefinition = {
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

  // ==================== Webhook Configuration ====================
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  description: {
    type: String,
    maxlength: 1000
  },

  targetUrl: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: CommonValidator.isValidURL,
      message: 'Invalid webhook URL'
    }
  },

  // ==================== Events & Subscriptions ====================
  events: {
    subscribed: [{
      type: String,
      required: true,
      enum: [
        // User events
        'user.created', 'user.updated', 'user.deleted', 'user.login', 'user.logout',
        'user.password_changed', 'user.mfa_enabled', 'user.mfa_disabled',
        
        // Organization events
        'organization.created', 'organization.updated', 'organization.deleted',
        'organization.member_added', 'organization.member_removed', 'organization.settings_changed',
        
        // Billing events
        'subscription.created', 'subscription.updated', 'subscription.cancelled',
        'subscription.renewed', 'subscription.trial_ended', 'payment.succeeded',
        'payment.failed', 'invoice.created', 'invoice.paid',
        
        // Project/Resource events
        'project.created', 'project.updated', 'project.deleted', 'project.member_added',
        'resource.created', 'resource.updated', 'resource.deleted',
        
        // Security events
        'security.breach_detected', 'security.suspicious_activity', 'security.access_denied',
        'security.permission_changed', 'security.audit_exported',
        
        // System events
        'system.maintenance_scheduled', 'system.status_changed', 'system.error',
        'api.rate_limit_exceeded', 'storage.limit_reached'
      ]
    }],
    
    eventFilters: {
      includePatterns: [String],
      excludePatterns: [String],
      conditions: mongoose.Schema.Types.Mixed
    },
    
    eventCategories: [{
      type: String,
      enum: ['user', 'organization', 'billing', 'project', 'security', 'system']
    }]
  },

  // ==================== Authentication & Security ====================
  authentication: {
    method: {
      type: String,
      enum: ['none', 'basic', 'bearer', 'hmac', 'oauth2', 'custom'],
      default: 'hmac'
    },
    
    credentials: {
      username: String,
      password: {
        type: String,
        select: false
      },
      token: {
        type: String,
        select: false
      },
      clientId: String,
      clientSecret: {
        type: String,
        select: false
      }
    },
    
    hmac: {
      algorithm: {
        type: String,
        enum: ['sha256', 'sha512'],
        default: 'sha256'
      },
      secret: {
        type: String,
        select: false,
        required: function() {
          return this.authentication.method === 'hmac';
        }
      },
      headerName: {
        type: String,
        default: 'X-Webhook-Signature'
      }
    },
    
    oauth2: {
      tokenUrl: String,
      scope: String,
      grantType: {
        type: String,
        default: 'client_credentials'
      }
    },
    
    customHeaders: {
      type: Map,
      of: String
    }
  },

  // ==================== Request Configuration ====================
  requestConfig: {
    method: {
      type: String,
      enum: ['POST', 'PUT', 'PATCH'],
      default: 'POST'
    },
    
    headers: {
      type: Map,
      of: String,
      default: () => new Map([
        ['Content-Type', 'application/json'],
        ['User-Agent', 'InsightSerenity-Webhook/1.0']
      ])
    },
    
    timeout: {
      type: Number,
      default: 30000, // 30 seconds
      min: 1000,
      max: 300000
    },
    
    maxPayloadSize: {
      type: Number,
      default: 1048576, // 1MB
      min: 1024,
      max: 10485760 // 10MB
    },
    
    compression: {
      enabled: {
        type: Boolean,
        default: true
      },
      algorithm: {
        type: String,
        enum: ['gzip', 'deflate', 'br'],
        default: 'gzip'
      }
    },
    
    tls: {
      rejectUnauthorized: {
        type: Boolean,
        default: true
      },
      minVersion: {
        type: String,
        enum: ['TLSv1.2', 'TLSv1.3'],
        default: 'TLSv1.2'
      }
    }
  },

  // ==================== Retry Configuration ====================
  retryConfig: {
    enabled: {
      type: Boolean,
      default: true
    },
    
    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
      max: 10
    },
    
    initialDelay: {
      type: Number,
      default: 1000, // 1 second
      min: 100,
      max: 60000
    },
    
    backoffMultiplier: {
      type: Number,
      default: 2,
      min: 1,
      max: 10
    },
    
    maxDelay: {
      type: Number,
      default: 300000, // 5 minutes
      min: 1000,
      max: 3600000
    },
    
    retryableStatusCodes: {
      type: [Number],
      default: [408, 429, 500, 502, 503, 504]
    },
    
    jitter: {
      enabled: {
        type: Boolean,
        default: true
      },
      factor: {
        type: Number,
        default: 0.1
      }
    }
  },

  // ==================== Delivery Status ====================
  status: {
    state: {
      type: String,
      enum: ['active', 'inactive', 'paused', 'failed', 'suspended'],
      default: 'active',
      index: true
    },
    
    health: {
      status: {
        type: String,
        enum: ['healthy', 'degraded', 'unhealthy', 'unknown'],
        default: 'unknown'
      },
      lastChecked: Date,
      consecutiveFailures: {
        type: Number,
        default: 0
      },
      errorRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 1
      }
    },
    
    suspension: {
      suspended: {
        type: Boolean,
        default: false
      },
      suspendedAt: Date,
      suspendedUntil: Date,
      reason: String,
      autoResume: {
        type: Boolean,
        default: true
      }
    },
    
    lastDelivery: {
      attemptedAt: Date,
      succeededAt: Date,
      failedAt: Date,
      statusCode: Number,
      responseTime: Number,
      error: String
    }
  },

  // ==================== Delivery History & Statistics ====================
  statistics: {
    totalDeliveries: {
      type: Number,
      default: 0
    },
    
    successfulDeliveries: {
      type: Number,
      default: 0
    },
    
    failedDeliveries: {
      type: Number,
      default: 0
    },
    
    totalRetries: {
      type: Number,
      default: 0
    },
    
    averageResponseTime: {
      type: Number,
      default: 0
    },
    
    successRate: {
      type: Number,
      default: 1,
      min: 0,
      max: 1
    },
    
    lastReset: {
      type: Date,
      default: Date.now
    },
    
    hourlyStats: [{
      hour: Date,
      deliveries: Number,
      successes: Number,
      failures: Number,
      avgResponseTime: Number
    }],
    
    eventStats: {
      type: Map,
      of: {
        count: Number,
        successes: Number,
        failures: Number
      }
    }
  },

  // ==================== Rate Limiting ====================
  rateLimit: {
    enabled: {
      type: Boolean,
      default: false
    },
    
    limits: {
      perSecond: Number,
      perMinute: Number,
      perHour: Number,
      perDay: Number
    },
    
    currentUsage: {
      second: {
        count: { type: Number, default: 0 },
        resetAt: Date
      },
      minute: {
        count: { type: Number, default: 0 },
        resetAt: Date
      },
      hour: {
        count: { type: Number, default: 0 },
        resetAt: Date
      },
      day: {
        count: { type: Number, default: 0 },
        resetAt: Date
      }
    },
    
    exceeded: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Payload Transformation ====================
  transformation: {
    enabled: {
      type: Boolean,
      default: false
    },
    
    template: {
      type: mongoose.Schema.Types.Mixed,
      validate: {
        validator: function(value) {
          if (!this.transformation.enabled) return true;
          return value && typeof value === 'object';
        },
        message: 'Transformation template is required when transformation is enabled'
      }
    },
    
    jmesPath: String,
    
    includeFields: [String],
    excludeFields: [String],
    
    customScript: {
      enabled: Boolean,
      script: String,
      sandbox: {
        type: Boolean,
        default: true
      }
    },
    
    format: {
      type: String,
      enum: ['json', 'xml', 'form', 'custom'],
      default: 'json'
    }
  },

  // ==================== Validation & Testing ====================
  validation: {
    enabled: {
      type: Boolean,
      default: true
    },
    
    validateSSL: {
      type: Boolean,
      default: true
    },
    
    validatePayload: {
      type: Boolean,
      default: true
    },
    
    schema: mongoose.Schema.Types.Mixed,
    
    testEndpoint: {
      enabled: Boolean,
      url: String,
      lastTested: Date,
      testResult: {
        success: Boolean,
        statusCode: Number,
        responseTime: Number,
        error: String
      }
    }
  },

  // ==================== Circuit Breaker ====================
  circuitBreaker: {
    enabled: {
      type: Boolean,
      default: true
    },
    
    threshold: {
      type: Number,
      default: 5
    },
    
    timeout: {
      type: Number,
      default: 60000 // 1 minute
    },
    
    state: {
      type: String,
      enum: ['closed', 'open', 'half-open'],
      default: 'closed'
    },
    
    lastStateChange: Date,
    nextAttempt: Date,
    failureCount: {
      type: Number,
      default: 0
    }
  },

  // ==================== Metadata & Tags ====================
  metadata: {
    tags: [String],
    
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    
    integration: {
      platform: String,
      version: String,
      accountId: String
    },
    
    documentation: {
      url: String,
      notes: String
    },
    
    owner: {
      team: String,
      contactEmail: String
    },
    
    compliance: {
      dataClassification: {
        type: String,
        enum: ['public', 'internal', 'confidential', 'restricted'],
        default: 'internal'
      },
      regulations: [String]
    }
  },

  // ==================== Delivery Queue ====================
  queue: {
    pending: [{
      eventId: String,
      eventType: String,
      payload: mongoose.Schema.Types.Mixed,
      attemptCount: Number,
      nextAttempt: Date,
      addedAt: Date
    }],
    
    processing: {
      type: Boolean,
      default: false
    },
    
    lastProcessed: Date,
    
    maxQueueSize: {
      type: Number,
      default: 1000
    }
  },

  // ==================== Audit & History ====================
  deliveryHistory: [{
    deliveryId: {
      type: String,
      default: () => stringHelper.generateRandomString(16)
    },
    eventId: String,
    eventType: String,
    deliveredAt: Date,
    attemptNumber: Number,
    success: Boolean,
    statusCode: Number,
    responseTime: Number,
    responseHeaders: mongoose.Schema.Types.Mixed,
    responseBody: String,
    error: String,
    retryCount: Number
  }],

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
const webhookSchema = BaseModel.createSchema(webhookSchemaDefinition, {
  collection: 'webhooks',
  timestamps: true,
  versionKey: false
});

// ==================== Indexes ====================
webhookSchema.index({ tenantId: 1, organizationId: 1, 'status.state': 1 });
webhookSchema.index({ 'events.subscribed': 1 });
webhookSchema.index({ 'status.state': 1, 'status.health.status': 1 });
webhookSchema.index({ 'queue.pending.nextAttempt': 1 });
webhookSchema.index({ 'circuitBreaker.state': 1, 'circuitBreaker.nextAttempt': 1 });

// ==================== Virtual Fields ====================
webhookSchema.virtual('isHealthy').get(function() {
  return this.status.health.status === 'healthy' && 
         this.status.state === 'active' &&
         this.circuitBreaker.state !== 'open';
});

webhookSchema.virtual('canDeliver').get(function() {
  return this.status.state === 'active' && 
         !this.status.suspension.suspended &&
         this.circuitBreaker.state !== 'open' &&
         !this.rateLimit.exceeded;
});

webhookSchema.virtual('requiresAuthentication').get(function() {
  return this.authentication.method !== 'none';
});

webhookSchema.virtual('queueSize').get(function() {
  return this.queue.pending.length;
});

webhookSchema.virtual('successRate').get(function() {
  if (this.statistics.totalDeliveries === 0) return 1;
  return this.statistics.successfulDeliveries / this.statistics.totalDeliveries;
});

// ==================== Pre-save Middleware ====================
webhookSchema.pre('save', async function(next) {
  try {
    // Generate HMAC secret if not provided
    if (this.authentication.method === 'hmac' && !this.authentication.hmac.secret) {
      this.authentication.hmac.secret = cryptoHelper.generateSecureToken(32);
    }

    // Hash sensitive credentials
    if (this.isModified('authentication.credentials.password')) {
      this.authentication.credentials.password = await hashService.hashPassword(
        this.authentication.credentials.password
      );
    }

    // Validate event subscriptions
    if (this.events.subscribed.length === 0 && this.events.eventCategories.length === 0) {
      throw new AppError('At least one event or event category must be subscribed', 400, 'NO_EVENTS_SUBSCRIBED');
    }

    // Initialize statistics if new
    if (this.isNew) {
      this.initializeStatistics();
    }

    // Update success rate
    this.updateSuccessRate();

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
webhookSchema.post('save', async function(doc) {
  try {
    // Audit log for security-sensitive changes
    if (doc.wasModified('authentication') || doc.wasModified('targetUrl')) {
      await auditService.logSecurityEvent({
        eventType: 'WEBHOOK_CONFIGURATION_CHANGED',
        tenantId: doc.tenantId,
        organizationId: doc.organizationId,
        userId: doc.updatedBy,
        details: {
          webhookId: doc._id,
          changes: doc.modifiedPaths()
        }
      });
    }
  } catch (error) {
    logger.error('Error in webhook post-save hook', {
      error: error.message,
      webhookId: doc._id
    });
  }
});

// ==================== Instance Methods ====================
webhookSchema.methods.initializeStatistics = function() {
  this.statistics = {
    totalDeliveries: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
    totalRetries: 0,
    averageResponseTime: 0,
    successRate: 1,
    lastReset: new Date(),
    hourlyStats: [],
    eventStats: new Map()
  };
};

webhookSchema.methods.updateSuccessRate = function() {
  if (this.statistics.totalDeliveries > 0) {
    this.statistics.successRate = this.statistics.successfulDeliveries / this.statistics.totalDeliveries;
  }
};

webhookSchema.methods.generateSignature = function(payload) {
  if (this.authentication.method !== 'hmac') {
    throw new AppError('HMAC authentication not configured', 400, 'HMAC_NOT_CONFIGURED');
  }

  const secret = this.authentication.hmac.secret;
  const algorithm = this.authentication.hmac.algorithm;
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  return cryptoHelper.generateHmac(payloadString, secret, algorithm);
};

webhookSchema.methods.validateUrl = async function() {
  try {
    const url = new URL(this.targetUrl);
    
    // Check protocol
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new AppError('Invalid protocol', 400, 'INVALID_PROTOCOL');
    }
    
    // Validate against private networks if required
    if (this.validation.validateSSL && url.protocol === 'http:') {
      logger.warn('Webhook uses insecure HTTP protocol', {
        webhookId: this._id,
        url: this.targetUrl
      });
    }
    
    return true;
  } catch (error) {
    throw new AppError('Invalid webhook URL', 400, 'INVALID_URL');
  }
};

webhookSchema.methods.deliver = async function(event) {
  // Check if webhook can deliver
  if (!this.canDeliver) {
    throw new AppError('Webhook cannot deliver in current state', 400, 'WEBHOOK_UNAVAILABLE');
  }

  // Check rate limits
  if (this.rateLimit.enabled) {
    await this.checkRateLimit();
  }

  // Transform payload if needed
  let payload = event.data;
  if (this.transformation.enabled) {
    payload = await this.transformPayload(payload);
  }

  // Prepare request
  const requestOptions = {
    url: this.targetUrl,
    method: this.requestConfig.method,
    headers: Object.fromEntries(this.requestConfig.headers),
    timeout: this.requestConfig.timeout,
    data: payload
  };

  // Add authentication
  await this.addAuthentication(requestOptions, payload);

  // Attempt delivery
  const startTime = Date.now();
  let response;
  let success = false;
  let error = null;

  try {
    response = await webhookService.sendWebhook(requestOptions);
    success = response.status >= 200 && response.status < 300;
  } catch (err) {
    error = err;
    success = false;
  }

  const responseTime = Date.now() - startTime;

  // Record delivery
  await this.recordDelivery({
    eventId: event.id,
    eventType: event.type,
    success,
    statusCode: response?.status,
    responseTime,
    error: error?.message
  });

  // Handle failure
  if (!success) {
    await this.handleDeliveryFailure(event, error);
  }

  return {
    success,
    statusCode: response?.status,
    responseTime,
    error: error?.message
  };
};

webhookSchema.methods.checkRateLimit = async function() {
  const now = new Date();
  const limits = this.rateLimit.limits;
  
  // Check each limit period
  const periods = ['second', 'minute', 'hour', 'day'];
  
  for (const period of periods) {
    if (!limits[`per${period.charAt(0).toUpperCase() + period.slice(1)}`]) continue;
    
    const current = this.rateLimit.currentUsage[period];
    const limit = limits[`per${period.charAt(0).toUpperCase() + period.slice(1)}`];
    
    // Reset if period expired
    if (!current.resetAt || current.resetAt < now) {
      current.count = 0;
      current.resetAt = this.getNextResetTime(period);
    }
    
    // Check limit
    if (current.count >= limit) {
      this.rateLimit.exceeded = true;
      throw new AppError(`Rate limit exceeded: ${limit} per ${period}`, 429, 'RATE_LIMIT_EXCEEDED');
    }
    
    // Increment counter
    current.count++;
  }
  
  this.rateLimit.exceeded = false;
  await this.save();
};

webhookSchema.methods.getNextResetTime = function(period) {
  const now = new Date();
  
  switch (period) {
    case 'second':
      return new Date(now.getTime() + 1000);
    case 'minute':
      return new Date(now.getTime() + 60000);
    case 'hour':
      return new Date(now.getTime() + 3600000);
    case 'day':
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow;
    default:
      return now;
  }
};

webhookSchema.methods.transformPayload = async function(payload) {
  if (!this.transformation.enabled) return payload;
  
  let transformed = payload;
  
  // Apply template
  if (this.transformation.template) {
    transformed = this.applyTemplate(payload, this.transformation.template);
  }
  
  // Apply field filters
  if (this.transformation.includeFields?.length > 0) {
    transformed = this.filterFields(transformed, this.transformation.includeFields, true);
  }
  
  if (this.transformation.excludeFields?.length > 0) {
    transformed = this.filterFields(transformed, this.transformation.excludeFields, false);
  }
  
  // Apply custom script if enabled
  if (this.transformation.customScript?.enabled && this.transformation.customScript.script) {
    transformed = await this.runCustomScript(transformed);
  }
  
  // Format conversion
  if (this.transformation.format !== 'json') {
    transformed = await this.convertFormat(transformed, this.transformation.format);
  }
  
  return transformed;
};

webhookSchema.methods.applyTemplate = function(data, template) {
  // Simple template replacement
  const processTemplate = (tmpl, context) => {
    if (typeof tmpl === 'string') {
      return tmpl.replace(/\{\{(\w+)\}\}/g, (match, key) => context[key] || match);
    }
    if (Array.isArray(tmpl)) {
      return tmpl.map(item => processTemplate(item, context));
    }
    if (typeof tmpl === 'object' && tmpl !== null) {
      const result = {};
      for (const [key, value] of Object.entries(tmpl)) {
        result[key] = processTemplate(value, context);
      }
      return result;
    }
    return tmpl;
  };
  
  return processTemplate(template, data);
};

webhookSchema.methods.filterFields = function(data, fields, include) {
  const result = {};
  
  const processPath = (obj, path) => {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  };
  
  const setPath = (obj, path, value) => {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    
    current[parts[parts.length - 1]] = value;
  };
  
  if (include) {
    // Include only specified fields
    for (const field of fields) {
      const value = processPath(data, field);
      if (value !== undefined) {
        setPath(result, field, value);
      }
    }
    return result;
  } else {
    // Exclude specified fields
    const cloned = JSON.parse(JSON.stringify(data));
    for (const field of fields) {
      const parts = field.split('.');
      let current = cloned;
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (current && typeof current === 'object' && parts[i] in current) {
          current = current[parts[i]];
        } else {
          break;
        }
      }
      
      if (current && typeof current === 'object') {
        delete current[parts[parts.length - 1]];
      }
    }
    return cloned;
  }
};

webhookSchema.methods.addAuthentication = async function(requestOptions, payload) {
  switch (this.authentication.method) {
    case 'none':
      break;
      
    case 'basic':
      const { username, password } = this.authentication.credentials;
      requestOptions.auth = { username, password };
      break;
      
    case 'bearer':
      requestOptions.headers['Authorization'] = `Bearer ${this.authentication.credentials.token}`;
      break;
      
    case 'hmac':
      const signature = this.generateSignature(payload);
      requestOptions.headers[this.authentication.hmac.headerName] = signature;
      break;
      
    case 'oauth2':
      // TODO: Implement OAuth2 token retrieval and refresh
      break;
      
    case 'custom':
      if (this.authentication.customHeaders) {
        for (const [key, value] of this.authentication.customHeaders) {
          requestOptions.headers[key] = value;
        }
      }
      break;
  }
};

webhookSchema.methods.recordDelivery = async function(deliveryInfo) {
  const { eventId, eventType, success, statusCode, responseTime, error } = deliveryInfo;
  
  // Update statistics
  this.statistics.totalDeliveries++;
  if (success) {
    this.statistics.successfulDeliveries++;
    this.status.health.consecutiveFailures = 0;
  } else {
    this.statistics.failedDeliveries++;
    this.status.health.consecutiveFailures++;
  }
  
  // Update average response time
  const totalTime = this.statistics.averageResponseTime * (this.statistics.totalDeliveries - 1) + responseTime;
  this.statistics.averageResponseTime = totalTime / this.statistics.totalDeliveries;
  
  // Update event statistics
  if (!this.statistics.eventStats.has(eventType)) {
    this.statistics.eventStats.set(eventType, { count: 0, successes: 0, failures: 0 });
  }
  
  const eventStat = this.statistics.eventStats.get(eventType);
  eventStat.count++;
  if (success) {
    eventStat.successes++;
  } else {
    eventStat.failures++;
  }
  
  // Update last delivery info
  this.status.lastDelivery = {
    attemptedAt: new Date(),
    succeededAt: success ? new Date() : this.status.lastDelivery.succeededAt,
    failedAt: !success ? new Date() : this.status.lastDelivery.failedAt,
    statusCode,
    responseTime,
    error
  };
  
  // Add to delivery history
  if (this.deliveryHistory.length >= 100) {
    this.deliveryHistory.shift(); // Keep only last 100 deliveries
  }
  
  this.deliveryHistory.push({
    eventId,
    eventType,
    deliveredAt: new Date(),
    success,
    statusCode,
    responseTime,
    error
  });
  
  // Update health status
  this.updateHealthStatus();
  
  await this.save();
};

webhookSchema.methods.updateHealthStatus = function() {
  const errorRate = this.statistics.failedDeliveries / this.statistics.totalDeliveries;
  
  if (this.status.health.consecutiveFailures >= 5 || errorRate > 0.5) {
    this.status.health.status = 'unhealthy';
  } else if (this.status.health.consecutiveFailures >= 3 || errorRate > 0.25) {
    this.status.health.status = 'degraded';
  } else {
    this.status.health.status = 'healthy';
  }
  
  this.status.health.errorRate = errorRate;
  this.status.health.lastChecked = new Date();
  
  // Update circuit breaker
  if (this.circuitBreaker.enabled) {
    this.updateCircuitBreaker();
  }
};

webhookSchema.methods.updateCircuitBreaker = function() {
  const { threshold, timeout } = this.circuitBreaker;
  
  switch (this.circuitBreaker.state) {
    case 'closed':
      if (this.status.health.consecutiveFailures >= threshold) {
        this.circuitBreaker.state = 'open';
        this.circuitBreaker.lastStateChange = new Date();
        this.circuitBreaker.nextAttempt = new Date(Date.now() + timeout);
        logger.warn('Circuit breaker opened', {
          webhookId: this._id,
          failures: this.status.health.consecutiveFailures
        });
      }
      break;
      
    case 'open':
      if (new Date() >= this.circuitBreaker.nextAttempt) {
        this.circuitBreaker.state = 'half-open';
        this.circuitBreaker.lastStateChange = new Date();
        logger.info('Circuit breaker half-opened', { webhookId: this._id });
      }
      break;
      
    case 'half-open':
      if (this.status.health.consecutiveFailures === 0) {
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failureCount = 0;
        this.circuitBreaker.lastStateChange = new Date();
        logger.info('Circuit breaker closed', { webhookId: this._id });
      } else {
        this.circuitBreaker.state = 'open';
        this.circuitBreaker.lastStateChange = new Date();
        this.circuitBreaker.nextAttempt = new Date(Date.now() + timeout * 2);
        logger.warn('Circuit breaker re-opened', { webhookId: this._id });
      }
      break;
  }
};

webhookSchema.methods.handleDeliveryFailure = async function(event, error) {
  // Add to retry queue if retries are enabled
  if (this.retryConfig.enabled && this.retryConfig.maxRetries > 0) {
    const existingEntry = this.queue.pending.find(e => e.eventId === event.id);
    
    if (existingEntry) {
      existingEntry.attemptCount++;
      if (existingEntry.attemptCount <= this.retryConfig.maxRetries) {
        existingEntry.nextAttempt = this.calculateNextRetryTime(existingEntry.attemptCount);
      } else {
        // Max retries exceeded, remove from queue
        this.queue.pending = this.queue.pending.filter(e => e.eventId !== event.id);
      }
    } else {
      // Add new entry to queue
      this.queue.pending.push({
        eventId: event.id,
        eventType: event.type,
        payload: event.data,
        attemptCount: 1,
        nextAttempt: this.calculateNextRetryTime(1),
        addedAt: new Date()
      });
    }
    
    // Trim queue if needed
    if (this.queue.pending.length > this.queue.maxQueueSize) {
      this.queue.pending = this.queue.pending.slice(-this.queue.maxQueueSize);
    }
    
    await this.save();
  }
  
  // Suspend webhook if too many failures
  if (this.status.health.consecutiveFailures >= 10) {
    await this.suspend('Too many consecutive failures', 3600000); // 1 hour
  }
};

webhookSchema.methods.calculateNextRetryTime = function(attemptCount) {
  const { initialDelay, backoffMultiplier, maxDelay, jitter } = this.retryConfig;
  
  let delay = initialDelay * Math.pow(backoffMultiplier, attemptCount - 1);
  delay = Math.min(delay, maxDelay);
  
  // Add jitter if enabled
  if (jitter.enabled) {
    const jitterAmount = delay * jitter.factor;
    delay += (Math.random() - 0.5) * 2 * jitterAmount;
  }
  
  return new Date(Date.now() + delay);
};

webhookSchema.methods.suspend = async function(reason, duration) {
  this.status.suspension.suspended = true;
  this.status.suspension.suspendedAt = new Date();
  this.status.suspension.reason = reason;
  
  if (duration) {
    this.status.suspension.suspendedUntil = new Date(Date.now() + duration);
  }
  
  await this.save();
  
  logger.warn('Webhook suspended', {
    webhookId: this._id,
    reason,
    until: this.status.suspension.suspendedUntil
  });
};

webhookSchema.methods.resume = async function() {
  this.status.suspension.suspended = false;
  this.status.suspension.suspendedAt = null;
  this.status.suspension.suspendedUntil = null;
  this.status.suspension.reason = null;
  
  // Reset circuit breaker
  if (this.circuitBreaker.state === 'open') {
    this.circuitBreaker.state = 'half-open';
    this.circuitBreaker.lastStateChange = new Date();
  }
  
  await this.save();
  
  logger.info('Webhook resumed', { webhookId: this._id });
};

webhookSchema.methods.test = async function() {
  const testEvent = {
    id: 'test-' + stringHelper.generateRandomString(16),
    type: 'webhook.test',
    data: {
      webhookId: this._id,
      timestamp: new Date(),
      message: 'This is a test webhook delivery'
    }
  };
  
  try {
    const result = await this.deliver(testEvent);
    
    this.validation.testEndpoint.lastTested = new Date();
    this.validation.testEndpoint.testResult = {
      success: result.success,
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      error: result.error
    };
    
    await this.save();
    
    return result;
  } catch (error) {
    this.validation.testEndpoint.lastTested = new Date();
    this.validation.testEndpoint.testResult = {
      success: false,
      error: error.message
    };
    
    await this.save();
    
    throw error;
  }
};

webhookSchema.methods.processQueue = async function() {
  if (this.queue.processing || this.queue.pending.length === 0) {
    return;
  }
  
  this.queue.processing = true;
  await this.save();
  
  try {
    const now = new Date();
    const readyEvents = this.queue.pending.filter(e => e.nextAttempt <= now);
    
    for (const queuedEvent of readyEvents) {
      try {
        await this.deliver({
          id: queuedEvent.eventId,
          type: queuedEvent.eventType,
          data: queuedEvent.payload
        });
        
        // Remove from queue on success
        this.queue.pending = this.queue.pending.filter(e => e.eventId !== queuedEvent.eventId);
      } catch (error) {
        // Error handling is done in deliver method
        logger.error('Failed to deliver queued event', {
          webhookId: this._id,
          eventId: queuedEvent.eventId,
          error: error.message
        });
      }
    }
    
    this.queue.lastProcessed = new Date();
  } finally {
    this.queue.processing = false;
    await this.save();
  }
};

// ==================== Static Methods ====================
webhookSchema.statics.createWebhook = async function(data) {
  const webhook = new this(data);
  await webhook.save();
  
  logger.info('Webhook created', {
    webhookId: webhook._id,
    organizationId: webhook.organizationId,
    events: webhook.events.subscribed.length
  });
  
  return webhook;
};

webhookSchema.statics.findActiveWebhooks = async function(tenantId, organizationId, eventType) {
  const query = {
    tenantId,
    organizationId,
    'status.state': 'active',
    'status.suspension.suspended': false,
    $or: [
      { 'events.subscribed': eventType },
      { 'events.eventCategories': eventType.split('.')[0] }
    ]
  };
  
  return await this.find(query);
};

webhookSchema.statics.deliverEvent = async function(event) {
  const { tenantId, organizationId, type: eventType } = event;
  
  const webhooks = await this.findActiveWebhooks(tenantId, organizationId, eventType);
  const results = [];
  
  for (const webhook of webhooks) {
    try {
      const result = await webhook.deliver(event);
      results.push({
        webhookId: webhook._id,
        success: result.success,
        statusCode: result.statusCode
      });
    } catch (error) {
      results.push({
        webhookId: webhook._id,
        success: false,
        error: error.message
      });
    }
  }
  
  logger.info('Event delivered to webhooks', {
    eventType,
    webhookCount: webhooks.length,
    successCount: results.filter(r => r.success).length
  });
  
  return results;
};

webhookSchema.statics.processAllQueues = async function() {
  const webhooks = await this.find({
    'queue.pending.0': { $exists: true },
    'queue.processing': false
  });
  
  const results = await Promise.allSettled(
    webhooks.map(webhook => webhook.processQueue())
  );
  
  const processed = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  
  logger.info('Processed webhook queues', { processed, failed });
  
  return { processed, failed };
};

webhookSchema.statics.checkHealthStatuses = async function() {
  const staleThreshold = new Date(Date.now() - 3600000); // 1 hour
  
  const webhooks = await this.find({
    'status.state': 'active',
    $or: [
      { 'status.health.lastChecked': { $lt: staleThreshold } },
      { 'status.health.lastChecked': { $exists: false } }
    ]
  });
  
  for (const webhook of webhooks) {
    webhook.updateHealthStatus();
    await webhook.save();
  }
  
  return webhooks.length;
};

webhookSchema.statics.resumeSuspendedWebhooks = async function() {
  const now = new Date();
  
  const webhooks = await this.find({
    'status.suspension.suspended': true,
    'status.suspension.autoResume': true,
    'status.suspension.suspendedUntil': { $lte: now }
  });
  
  for (const webhook of webhooks) {
    await webhook.resume();
  }
  
  logger.info('Resumed suspended webhooks', { count: webhooks.length });
  
  return webhooks.length;
};

webhookSchema.statics.getWebhookStatistics = async function(filters = {}) {
  const match = {};
  
  if (filters.tenantId) match.tenantId = filters.tenantId;
  if (filters.organizationId) match.organizationId = filters.organizationId;
  if (filters.startDate || filters.endDate) {
    match.createdAt = {};
    if (filters.startDate) match.createdAt.$gte = filters.startDate;
    if (filters.endDate) match.createdAt.$lte = filters.endDate;
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: { $sum: { $cond: [{ $eq: ['$status.state', 'active'] }, 1, 0] } },
              healthy: { $sum: { $cond: [{ $eq: ['$status.health.status', 'healthy'] }, 1, 0] } },
              suspended: { $sum: { $cond: ['$status.suspension.suspended', 1, 0] } }
            }
          }
        ],
        deliveryStats: [
          {
            $group: {
              _id: null,
              totalDeliveries: { $sum: '$statistics.totalDeliveries' },
              successfulDeliveries: { $sum: '$statistics.successfulDeliveries' },
              failedDeliveries: { $sum: '$statistics.failedDeliveries' },
              avgResponseTime: { $avg: '$statistics.averageResponseTime' }
            }
          }
        ],
        eventDistribution: [
          { $unwind: '$events.subscribed' },
          {
            $group: {
              _id: '$events.subscribed',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        authMethods: [
          {
            $group: {
              _id: '$authentication.method',
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);
  
  const result = stats[0];
  
  return {
    overview: result.overview[0] || {},
    deliveryStats: result.deliveryStats[0] || {},
    eventDistribution: result.eventDistribution,
    authMethods: result.authMethods
  };
};

// Create and export model
const WebhookModel = BaseModel.createModel('Webhook', webhookSchema);

module.exports = WebhookModel;