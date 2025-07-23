'use strict';

/**
 * @fileoverview Webhook model for event-driven integrations
 * @module shared/lib/database/models/webhook-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/security/encryption/crypto-utils
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const stringHelper = require('../../utils/helpers/string-helper');
const cryptoUtils = require('../../security/encryption/crypto-utils');

/**
 * Webhook schema definition
 */
const webhookSchemaDefinition = {
  // Webhook Identification
  webhookId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  description: {
    type: String,
    maxlength: 500
  },

  // Endpoint Configuration
  url: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Invalid webhook URL'
    }
  },

  method: {
    type: String,
    enum: ['POST', 'PUT', 'PATCH'],
    default: 'POST'
  },

  headers: {
    type: Map,
    of: String,
    default: new Map()
  },

  // Authentication
  auth: {
    type: {
      type: String,
      enum: ['none', 'basic', 'bearer', 'apikey', 'hmac', 'oauth2'],
      default: 'none'
    },
    credentials: {
      username: {
        type: String,
        select: false
      },
      password: {
        type: String,
        select: false
      },
      token: {
        type: String,
        select: false
      },
      apiKey: {
        type: String,
        select: false
      },
      apiKeyHeader: String,
      secret: {
        type: String,
        select: false
      },
      algorithm: {
        type: String,
        enum: ['sha256', 'sha512'],
        default: 'sha256'
      },
      oauth: {
        clientId: {
          type: String,
          select: false
        },
        clientSecret: {
          type: String,
          select: false
        },
        tokenUrl: String,
        scope: String
      }
    }
  },

  // Events
  events: [{
    type: String,
    required: true
  }],

  eventFilters: {
    include: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    exclude: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  // Owner Information
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'failed'],
    default: 'active',
    index: true
  },

  enabled: {
    type: Boolean,
    default: true,
    index: true
  },

  // Verification
  verified: {
    type: Boolean,
    default: false
  },

  verificationToken: {
    type: String,
    select: false
  },

  verifiedAt: Date,

  // Configuration
  config: {
    retryEnabled: {
      type: Boolean,
      default: true
    },
    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
      max: 10
    },
    retryDelay: {
      type: Number,
      default: 1000, // milliseconds
      min: 100,
      max: 300000
    },
    timeout: {
      type: Number,
      default: 30000, // milliseconds
      min: 1000,
      max: 300000
    },
    includeHeaders: {
      type: Boolean,
      default: true
    },
    payloadFormat: {
      type: String,
      enum: ['json', 'form', 'xml'],
      default: 'json'
    },
    signatureHeader: {
      type: String,
      default: 'X-Webhook-Signature'
    },
    timestampHeader: {
      type: String,
      default: 'X-Webhook-Timestamp'
    },
    idHeader: {
      type: String,
      default: 'X-Webhook-ID'
    },
    batchingEnabled: {
      type: Boolean,
      default: false
    },
    batchSize: {
      type: Number,
      default: 10,
      min: 1,
      max: 100
    },
    batchDelay: {
      type: Number,
      default: 5000 // milliseconds
    }
  },

  // Rate Limiting
  rateLimit: {
    enabled: {
      type: Boolean,
      default: false
    },
    requests: {
      type: Number,
      default: 100
    },
    window: {
      type: Number,
      default: 60000 // 1 minute in milliseconds
    },
    current: {
      count: {
        type: Number,
        default: 0
      },
      resetAt: Date
    }
  },

  // Delivery Statistics
  stats: {
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
    lastDeliveryAt: Date,
    lastSuccessAt: Date,
    lastFailureAt: Date,
    averageResponseTime: {
      type: Number,
      default: 0
    },
    consecutiveFailures: {
      type: Number,
      default: 0
    },
    totalRetries: {
      type: Number,
      default: 0
    }
  },

  // Recent Deliveries
  recentDeliveries: [{
    deliveryId: String,
    eventType: String,
    timestamp: Date,
    status: {
      type: String,
      enum: ['pending', 'success', 'failure', 'retrying']
    },
    statusCode: Number,
    responseTime: Number,
    attempts: Number,
    error: String,
    payload: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    },
    response: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    }
  }],

  // Error Tracking
  errors: [{
    timestamp: Date,
    type: {
      type: String,
      enum: ['connection', 'timeout', 'auth', 'validation', 'server', 'unknown']
    },
    message: String,
    statusCode: Number,
    eventType: String,
    resolved: {
      type: Boolean,
      default: false
    }
  }],

  // Suspension
  suspension: {
    suspended: {
      type: Boolean,
      default: false
    },
    reason: String,
    suspendedAt: Date,
    autoResume: {
      type: Boolean,
      default: true
    },
    resumeAt: Date,
    suspensionCount: {
      type: Number,
      default: 0
    }
  },

  // Security
  security: {
    ipWhitelist: [String],
    allowedOrigins: [String],
    requireHttps: {
      type: Boolean,
      default: true
    },
    validateSsl: {
      type: Boolean,
      default: true
    }
  },

  // Transform Rules
  transformRules: [{
    field: String,
    operation: {
      type: String,
      enum: ['remove', 'rename', 'mask', 'encrypt', 'hash', 'custom']
    },
    target: String,
    value: mongoose.Schema.Types.Mixed
  }],

  // Metadata
  metadata: {
    version: {
      type: String,
      default: '1.0'
    },
    tags: [String],
    custom: mongoose.Schema.Types.Mixed
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  },

  lastTriggeredAt: Date,

  // Expiration
  expiresAt: {
    type: Date,
    index: true
  }
};

// Create schema
const webhookSchema = BaseModel.createSchema(webhookSchemaDefinition, {
  collection: 'webhooks',
  timestamps: false // We manage timestamps manually
});

// Indexes
webhookSchema.index({ organizationId: 1, status: 1 });
webhookSchema.index({ events: 1, enabled: 1 });
webhookSchema.index({ 'stats.lastDeliveryAt': -1 });
webhookSchema.index({ 'suspension.suspended': 1, 'suspension.resumeAt': 1 });

// Virtual fields
webhookSchema.virtual('isActive').get(function() {
  return this.status === 'active' && this.enabled && !this.suspension.suspended;
});

webhookSchema.virtual('successRate').get(function() {
  if (this.stats.totalDeliveries === 0) return 100;
  return (this.stats.successfulDeliveries / this.stats.totalDeliveries) * 100;
});

webhookSchema.virtual('failureRate').get(function() {
  if (this.stats.totalDeliveries === 0) return 0;
  return (this.stats.failedDeliveries / this.stats.totalDeliveries) * 100;
});

webhookSchema.virtual('needsVerification').get(function() {
  return !this.verified && this.verificationToken;
});

webhookSchema.virtual('isSuspended').get(function() {
  return this.suspension.suspended && 
         (!this.suspension.resumeAt || this.suspension.resumeAt > new Date());
});

// Pre-save middleware
webhookSchema.pre('save', async function(next) {
  try {
    // Generate webhook ID if not provided
    if (!this.webhookId && this.isNew) {
      this.webhookId = await this.constructor.generateWebhookId();
    }

    // Generate verification token if not verified
    if (!this.verified && !this.verificationToken && this.isNew) {
      this.verificationToken = await this.constructor.generateVerificationToken();
    }

    // Update timestamp
    this.updatedAt = new Date();

    // Ensure default headers
    if (!this.headers.has('Content-Type')) {
      this.headers.set('Content-Type', 
        this.config.payloadFormat === 'json' ? 'application/json' : 
        this.config.payloadFormat === 'xml' ? 'application/xml' : 
        'application/x-www-form-urlencoded'
      );
    }

    // Trim recent deliveries to last 100
    if (this.recentDeliveries.length > 100) {
      this.recentDeliveries = this.recentDeliveries.slice(-100);
    }

    // Trim errors to last 50
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(-50);
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
webhookSchema.methods.trigger = async function(event, payload) {
  if (!this.isActive) {
    throw new AppError('Webhook is not active', 400, 'WEBHOOK_INACTIVE');
  }

  // Check if event is subscribed
  if (!this.events.includes(event) && !this.events.includes('*')) {
    return { skipped: true, reason: 'Event not subscribed' };
  }

  // Apply event filters
  if (!this.#passesFilters(event, payload)) {
    return { skipped: true, reason: 'Filtered out' };
  }

  // Check rate limit
  if (this.rateLimit.enabled && !this.#checkRateLimit()) {
    throw new AppError('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
  }

  // Create delivery
  const delivery = {
    deliveryId: `del_${Date.now()}_${stringHelper.generateRandomString(8)}`,
    eventType: event,
    timestamp: new Date(),
    status: 'pending',
    attempts: 0,
    payload
  };

  // Transform payload
  const transformedPayload = await this.#transformPayload(payload);

  // Prepare request
  const request = await this.#prepareRequest(event, transformedPayload, delivery.deliveryId);

  // Execute delivery
  const result = await this.#deliver(request, delivery);

  // Update statistics
  await this.#updateStats(result);

  // Record delivery
  this.recentDeliveries.push(delivery);
  this.lastTriggeredAt = new Date();

  // Handle failures
  if (!result.success) {
    await this.#handleFailure(result, delivery);
  } else {
    this.stats.consecutiveFailures = 0;
  }

  await this.save();

  return result;
};

webhookSchema.methods.verify = async function(token) {
  if (this.verified) {
    return { verified: true, message: 'Already verified' };
  }

  if (token !== this.verificationToken) {
    throw new AppError('Invalid verification token', 400, 'INVALID_TOKEN');
  }

  this.verified = true;
  this.verifiedAt = new Date();
  this.verificationToken = undefined;

  await this.save();

  return { verified: true, message: 'Webhook verified successfully' };
};

webhookSchema.methods.suspend = async function(reason, duration) {
  this.suspension.suspended = true;
  this.suspension.reason = reason;
  this.suspension.suspendedAt = new Date();
  this.suspension.suspensionCount++;

  if (duration && this.suspension.autoResume) {
    this.suspension.resumeAt = new Date(Date.now() + duration);
  }

  this.status = 'suspended';

  await this.save();
  await this.audit('WEBHOOK_SUSPENDED', { reason, duration });

  return this;
};

webhookSchema.methods.resume = async function() {
  if (!this.suspension.suspended) {
    return this;
  }

  this.suspension.suspended = false;
  this.suspension.reason = null;
  this.suspension.suspendedAt = null;
  this.suspension.resumeAt = null;

  this.status = 'active';
  this.stats.consecutiveFailures = 0;

  await this.save();
  await this.audit('WEBHOOK_RESUMED');

  return this;
};

webhookSchema.methods.updateAuth = async function(authData) {
  Object.assign(this.auth, authData);

  // Encrypt sensitive data
  if (this.auth.credentials) {
    for (const field of ['password', 'token', 'apiKey', 'secret']) {
      if (this.auth.credentials[field]) {
        this.auth.credentials[field] = await cryptoUtils.encrypt(
          this.auth.credentials[field]
        );
      }
    }
  }

  await this.save();
  return this;
};

webhookSchema.methods.test = async function(samplePayload) {
  const testDelivery = {
    deliveryId: `test_${Date.now()}`,
    eventType: 'test',
    timestamp: new Date(),
    status: 'pending',
    attempts: 1,
    payload: samplePayload || { test: true, timestamp: new Date() }
  };

  const request = await this.#prepareRequest('test', testDelivery.payload, testDelivery.deliveryId);
  const result = await this.#deliver(request, testDelivery, true);

  return {
    success: result.success,
    statusCode: result.statusCode,
    responseTime: result.responseTime,
    error: result.error,
    response: result.response
  };
};

webhookSchema.methods.addEvent = async function(event) {
  if (!this.events.includes(event)) {
    this.events.push(event);
    await this.save();
  }
  return this;
};

webhookSchema.methods.removeEvent = async function(event) {
  this.events = this.events.filter(e => e !== event);
  await this.save();
  return this;
};

webhookSchema.methods.clearStats = async function() {
  this.stats = {
    totalDeliveries: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
    averageResponseTime: 0,
    consecutiveFailures: 0,
    totalRetries: 0
  };
  
  this.recentDeliveries = [];
  this.errors = [];

  await this.save();
  return this;
};

// Private instance methods
webhookSchema.methods.#passesFilters = function(event, payload) {
  // Check include filters
  if (this.eventFilters.include && this.eventFilters.include.size > 0) {
    for (const [key, value] of this.eventFilters.include) {
      if (payload[key] !== value) {
        return false;
      }
    }
  }

  // Check exclude filters
  if (this.eventFilters.exclude && this.eventFilters.exclude.size > 0) {
    for (const [key, value] of this.eventFilters.exclude) {
      if (payload[key] === value) {
        return false;
      }
    }
  }

  return true;
};

webhookSchema.methods.#checkRateLimit = function() {
  const now = Date.now();
  
  if (!this.rateLimit.current.resetAt || this.rateLimit.current.resetAt < now) {
    this.rateLimit.current.count = 0;
    this.rateLimit.current.resetAt = new Date(now + this.rateLimit.window);
  }

  if (this.rateLimit.current.count >= this.rateLimit.requests) {
    return false;
  }

  this.rateLimit.current.count++;
  return true;
};

webhookSchema.methods.#transformPayload = async function(payload) {
  let transformed = { ...payload };

  for (const rule of this.transformRules) {
    switch (rule.operation) {
      case 'remove':
        delete transformed[rule.field];
        break;
        
      case 'rename':
        if (transformed[rule.field] !== undefined) {
          transformed[rule.target] = transformed[rule.field];
          delete transformed[rule.field];
        }
        break;
        
      case 'mask':
        if (transformed[rule.field]) {
          transformed[rule.field] = transformed[rule.field].toString().replace(/./g, '*');
        }
        break;
        
      case 'encrypt':
        if (transformed[rule.field]) {
          transformed[rule.field] = await cryptoUtils.encrypt(transformed[rule.field]);
        }
        break;
        
      case 'hash':
        if (transformed[rule.field]) {
          transformed[rule.field] = cryptoUtils.hashString(transformed[rule.field]);
        }
        break;
    }
  }

  return transformed;
};

webhookSchema.methods.#prepareRequest = async function(event, payload, deliveryId) {
  const timestamp = Date.now();
  const headers = Object.fromEntries(this.headers);

  // Add webhook headers
  headers[this.config.idHeader] = deliveryId;
  headers[this.config.timestampHeader] = timestamp.toString();
  headers['X-Webhook-Event'] = event;

  // Add authentication
  switch (this.auth.type) {
    case 'basic':
      const credentials = `${this.auth.credentials.username}:${await cryptoUtils.decrypt(this.auth.credentials.password)}`;
      headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
      break;
      
    case 'bearer':
      headers['Authorization'] = `Bearer ${await cryptoUtils.decrypt(this.auth.credentials.token)}`;
      break;
      
    case 'apikey':
      headers[this.auth.credentials.apiKeyHeader || 'X-API-Key'] = await cryptoUtils.decrypt(this.auth.credentials.apiKey);
      break;
      
    case 'hmac':
      const signature = await this.#generateSignature(payload, timestamp);
      headers[this.config.signatureHeader] = signature;
      break;
  }

  // Prepare body
  let body;
  switch (this.config.payloadFormat) {
    case 'json':
      body = JSON.stringify(payload);
      break;
      
    case 'form':
      body = new URLSearchParams(payload).toString();
      break;
      
    case 'xml':
      // Simple XML conversion
      body = this.#toXML(payload);
      break;
  }

  return {
    url: this.url,
    method: this.method,
    headers,
    body,
    timeout: this.config.timeout
  };
};

webhookSchema.methods.#generateSignature = async function(payload, timestamp) {
  const secret = await cryptoUtils.decrypt(this.auth.credentials.secret);
  const data = `${timestamp}.${JSON.stringify(payload)}`;
  
  return cryptoUtils.generateHMAC(data, secret, this.auth.credentials.algorithm);
};

webhookSchema.methods.#deliver = async function(request, delivery, isTest = false) {
  const startTime = Date.now();
  let result = {
    success: false,
    attempts: 0
  };

  for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
    result.attempts = attempt + 1;
    delivery.attempts = result.attempts;

    try {
      // In production, make actual HTTP request
      // For now, simulate
      const response = await this.#simulateHttpRequest(request);
      
      result.success = response.status >= 200 && response.status < 300;
      result.statusCode = response.status;
      result.responseTime = Date.now() - startTime;
      result.response = response.body;

      if (result.success) {
        delivery.status = 'success';
        delivery.statusCode = result.statusCode;
        delivery.responseTime = result.responseTime;
        break;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      result.error = error.message;
      delivery.status = attempt < this.config.maxRetries ? 'retrying' : 'failure';
      delivery.error = error.message;

      if (attempt < this.config.maxRetries && this.config.retryEnabled && !isTest) {
        const delay = this.config.retryDelay * Math.pow(2, attempt); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        this.stats.totalRetries++;
      }
    }
  }

  return result;
};

webhookSchema.methods.#simulateHttpRequest = async function(request) {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));

  // Simulate various responses
  const scenarios = [
    { status: 200, statusText: 'OK', probability: 0.8 },
    { status: 201, statusText: 'Created', probability: 0.1 },
    { status: 400, statusText: 'Bad Request', probability: 0.05 },
    { status: 401, statusText: 'Unauthorized', probability: 0.02 },
    { status: 500, statusText: 'Internal Server Error', probability: 0.02 },
    { status: 503, statusText: 'Service Unavailable', probability: 0.01 }
  ];

  const random = Math.random();
  let cumulative = 0;

  for (const scenario of scenarios) {
    cumulative += scenario.probability;
    if (random <= cumulative) {
      return {
        status: scenario.status,
        statusText: scenario.statusText,
        body: { received: true, timestamp: new Date() }
      };
    }
  }

  return scenarios[0];
};

webhookSchema.methods.#updateStats = async function(result) {
  this.stats.totalDeliveries++;
  
  if (result.success) {
    this.stats.successfulDeliveries++;
    this.stats.lastSuccessAt = new Date();
  } else {
    this.stats.failedDeliveries++;
    this.stats.lastFailureAt = new Date();
    this.stats.consecutiveFailures++;
  }

  this.stats.lastDeliveryAt = new Date();

  // Update average response time
  if (result.responseTime) {
    const totalTime = this.stats.averageResponseTime * (this.stats.totalDeliveries - 1);
    this.stats.averageResponseTime = (totalTime + result.responseTime) / this.stats.totalDeliveries;
  }
};

webhookSchema.methods.#handleFailure = async function(result, delivery) {
  // Record error
  this.errors.push({
    timestamp: new Date(),
    type: this.#categorizeError(result.error),
    message: result.error,
    statusCode: result.statusCode,
    eventType: delivery.eventType
  });

  // Auto-suspend after consecutive failures
  if (this.stats.consecutiveFailures >= 10) {
    await this.suspend(
      'Suspended due to consecutive failures',
      24 * 60 * 60 * 1000 // 24 hours
    );
  }
};

webhookSchema.methods.#categorizeError = function(error) {
  if (error.includes('timeout')) return 'timeout';
  if (error.includes('ECONNREFUSED') || error.includes('ENOTFOUND')) return 'connection';
  if (error.includes('401') || error.includes('403')) return 'auth';
  if (error.includes('400') || error.includes('422')) return 'validation';
  if (error.includes('500') || error.includes('502') || error.includes('503')) return 'server';
  return 'unknown';
};

webhookSchema.methods.#toXML = function(obj, rootName = 'webhook') {
  const convert = (data, name) => {
    if (Array.isArray(data)) {
      return data.map(item => convert(item, name)).join('');
    }
    
    if (typeof data === 'object' && data !== null) {
      const attrs = [];
      const children = [];
      
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object') {
          children.push(convert(value, key));
        } else {
          attrs.push(`${key}="${value}"`);
        }
      }
      
      const attrString = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
      const childString = children.join('');
      
      return `<${name}${attrString}>${childString}</${name}>`;
    }
    
    return `<${name}>${data}</${name}>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>${convert(obj, rootName)}`;
};

// Static methods
webhookSchema.statics.generateWebhookId = function() {
  return `whk_${Date.now()}_${stringHelper.generateRandomString(12)}`;
};

webhookSchema.statics.generateVerificationToken = function() {
  return stringHelper.generateRandomString(32);
};

webhookSchema.statics.createWebhook = async function(data) {
  const webhook = new this(data);
  
  // Set default events if not provided
  if (!webhook.events || webhook.events.length === 0) {
    webhook.events = ['*']; // Subscribe to all events
  }

  await webhook.save();
  
  return webhook;
};

webhookSchema.statics.findByOrganization = async function(organizationId, options = {}) {
  const {
    status,
    enabled,
    event,
    limit = 50,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;

  const query = { organizationId };

  if (status) {
    query.status = status;
  }

  if (enabled !== undefined) {
    query.enabled = enabled;
  }

  if (event) {
    query.events = event;
  }

  return await this.find(query)
    .sort(sort)
    .limit(limit)
    .skip(skip);
};

webhookSchema.statics.findActiveByEvent = async function(event, organizationId) {
  return await this.find({
    organizationId,
    events: { $in: [event, '*'] },
    status: 'active',
    enabled: true,
    'suspension.suspended': false
  });
};

webhookSchema.statics.triggerEvent = async function(event, payload, organizationId) {
  const webhooks = await this.findActiveByEvent(event, organizationId);
  const results = [];

  for (const webhook of webhooks) {
    try {
      const result = await webhook.trigger(event, payload);
      results.push({
        webhookId: webhook.webhookId,
        success: result.success || result.skipped,
        ...result
      });
    } catch (error) {
      results.push({
        webhookId: webhook.webhookId,
        success: false,
        error: error.message
      });
    }
  }

  logger.info('Webhook event triggered', {
    event,
    organizationId,
    webhooksTriggered: results.length,
    successful: results.filter(r => r.success).length
  });

  return results;
};

webhookSchema.statics.resumeSuspended = async function() {
  const now = new Date();
  
  const suspended = await this.find({
    'suspension.suspended': true,
    'suspension.autoResume': true,
    'suspension.resumeAt': { $lte: now }
  });

  const results = {
    processed: 0,
    resumed: 0,
    failed: 0
  };

  for (const webhook of suspended) {
    try {
      await webhook.resume();
      results.resumed++;
    } catch (error) {
      results.failed++;
      logger.error('Failed to resume webhook', {
        webhookId: webhook.webhookId,
        error: error.message
      });
    }
    results.processed++;
  }

  return results;
};

webhookSchema.statics.getStatistics = async function(organizationId) {
  const webhooks = await this.find({ organizationId });
  
  const stats = {
    total: webhooks.length,
    active: 0,
    suspended: 0,
    verified: 0,
    totalDeliveries: 0,
    totalSuccessful: 0,
    totalFailed: 0,
    averageSuccessRate: 0,
    eventDistribution: {},
    statusDistribution: {}
  };

  for (const webhook of webhooks) {
    if (webhook.isActive) stats.active++;
    if (webhook.isSuspended) stats.suspended++;
    if (webhook.verified) stats.verified++;
    
    stats.totalDeliveries += webhook.stats.totalDeliveries;
    stats.totalSuccessful += webhook.stats.successfulDeliveries;
    stats.totalFailed += webhook.stats.failedDeliveries;

    // Event distribution
    for (const event of webhook.events) {
      stats.eventDistribution[event] = (stats.eventDistribution[event] || 0) + 1;
    }

    // Status distribution
    stats.statusDistribution[webhook.status] = (stats.statusDistribution[webhook.status] || 0) + 1;
  }

  if (stats.totalDeliveries > 0) {
    stats.averageSuccessRate = (stats.totalSuccessful / stats.totalDeliveries) * 100;
  }

  return stats;
};

webhookSchema.statics.cleanup = async function(options = {}) {
  const {
    deleteInactiveDays = 90,
    deleteFailedDays = 30
  } = options;

  const now = new Date();
  const inactiveDate = new Date(now - deleteInactiveDays * 24 * 60 * 60 * 1000);
  const failedDate = new Date(now - deleteFailedDays * 24 * 60 * 60 * 1000);

  // Delete old inactive webhooks
  const inactiveResult = await this.deleteMany({
    status: 'inactive',
    updatedAt: { $lt: inactiveDate }
  });

  // Delete old failed webhooks
  const failedResult = await this.deleteMany({
    status: 'failed',
    updatedAt: { $lt: failedDate }
  });

  // Delete expired webhooks
  const expiredResult = await this.deleteMany({
    expiresAt: { $lt: now }
  });

  logger.info('Webhook cleanup completed', {
    inactive: inactiveResult.deletedCount,
    failed: failedResult.deletedCount,
    expired: expiredResult.deletedCount
  });

  return {
    inactive: inactiveResult.deletedCount,
    failed: failedResult.deletedCount,
    expired: expiredResult.deletedCount
  };
};

// Create and export model
const WebhookModel = BaseModel.createModel('Webhook', webhookSchema);

module.exports = {
  schema: webhookSchema,
  model: WebhookModel
};