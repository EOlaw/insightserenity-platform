'use strict';

/**
 * @fileoverview CORS whitelist model for managing allowed origins in production environments
 * @module shared/lib/database/models/security/cors-whitelist-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/metrics-service
 * @requires module:shared/lib/utils/validation
 * @requires module:shared/lib/utils/encryption
 * @requires module:crypto
 * @requires module:dns
 * @version 2.0.0
 * @since 1.0.0
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');
const NotificationService = require('../../../services/notification-service');
const MetricsService = require('../../../services/metrics-service');
const { validateDomain, validateIP, sanitizeInput } = require('../../../utils/validation');
const { encrypt, decrypt, generateHash } = require('../../../utils/encryption');
const crypto = require('crypto');
const dns = require('dns').promises;

/**
 * CORS whitelist schema definition with comprehensive production features
 */
const corsWhitelistSchemaDefinition = {
  // ==================== Multi-Tenant Context ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true,
    sparse: true,
    validate: {
      validator: async function(value) {
        if (!value) return true;
        const Tenant = mongoose.model('Tenant');
        const tenant = await Tenant.findById(value);
        return !!tenant;
      },
      message: 'Referenced tenant does not exist'
    }
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization ID is required'],
    index: true,
    validate: {
      validator: async function(value) {
        const Organization = mongoose.model('Organization');
        const organization = await Organization.findById(value);
        return !!organization;
      },
      message: 'Referenced organization does not exist'
    }
  },

  // ==================== Origin Information ====================
  origin: {
    type: String,
    required: [true, 'Origin URL is required'],
    trim: true,
    lowercase: true,
    maxlength: [2000, 'Origin URL cannot exceed 2000 characters'],
    validate: [
      {
        validator: function(value) {
          try {
            const url = new URL(value);
            return url.origin === value && ['http:', 'https:'].includes(url.protocol);
          } catch {
            return false;
          }
        },
        message: 'Invalid origin format. Must be a valid URL origin (e.g., https://example.com)'
      },
      {
        validator: function(value) {
          // Block known malicious patterns
          const maliciousPatterns = [
            /javascript:/i,
            /data:/i,
            /vbscript:/i,
            /file:/i,
            /ftp:/i
          ];
          return !maliciousPatterns.some(pattern => pattern.test(value));
        },
        message: 'Origin contains potentially malicious protocol'
      }
    ]
  },

  originHash: {
    type: String,
    index: true,
    unique: true
  },

  type: {
    type: String,
    enum: {
      values: ['static', 'pattern', 'dynamic', 'tenant', 'wildcard', 'subdomain'],
      message: 'Type must be one of: static, pattern, dynamic, tenant, wildcard, subdomain'
    },
    default: 'static',
    required: [true, 'Origin type is required'],
    index: true
  },

  // ==================== Status & Control ====================
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  priority: {
    type: Number,
    default: 100,
    min: [1, 'Priority must be at least 1'],
    max: [1000, 'Priority cannot exceed 1000'],
    index: true
  },

  weight: {
    type: Number,
    default: 1.0,
    min: [0.1, 'Weight must be at least 0.1'],
    max: [10.0, 'Weight cannot exceed 10.0']
  },

  // ==================== Validity Period ====================
  effectiveDate: {
    type: Date,
    default: Date.now,
    index: true
  },

  expiryDate: {
    type: Date,
    index: true,
    validate: {
      validator: function(value) {
        return !value || value > this.effectiveDate;
      },
      message: 'Expiry date must be after effective date'
    }
  },

  autoRenew: {
    enabled: {
      type: Boolean,
      default: false
    },
    interval: {
      type: String,
      enum: ['monthly', 'quarterly', 'semi-annually', 'annually'],
      default: 'quarterly'
    },
    maxRenewals: {
      type: Number,
      default: 4,
      min: 1,
      max: 20
    },
    currentRenewals: {
      type: Number,
      default: 0
    }
  },

  // ==================== Security & Validation ====================
  security: {
    requireHTTPS: {
      type: Boolean,
      default: function() {
        return process.env.NODE_ENV === 'production';
      }
    },
    allowCredentials: {
      type: Boolean,
      default: true
    },
    maxAge: {
      type: Number,
      default: 86400,
      min: [0, 'Max age cannot be negative'],
      max: [2592000, 'Max age cannot exceed 30 days']
    },
    restrictedMethods: [{
      type: String,
      enum: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE']
    }],
    restrictedHeaders: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    allowedHeaders: [{
      type: String,
      trim: true
    }],
    exposedHeaders: [{
      type: String,
      trim: true
    }],
    ipRestrictions: [{
      type: {
        type: String,
        enum: ['allow', 'deny'],
        default: 'allow'
      },
      cidr: {
        type: String,
        validate: {
          validator: validateIP,
          message: 'Invalid IP address or CIDR notation'
        }
      },
      description: String,
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    rateLimiting: {
      enabled: {
        type: Boolean,
        default: false
      },
      requests: {
        type: Number,
        default: 1000,
        min: 1
      },
      windowMs: {
        type: Number,
        default: 900000,
        min: 1000
      },
      skipSuccessful: {
        type: Boolean,
        default: false
      },
      skipFailedRequests: {
        type: Boolean,
        default: false
      }
    },
    contentSecurityPolicy: {
      enabled: {
        type: Boolean,
        default: false
      },
      directives: {
        type: Map,
        of: [String]
      }
    },
    certificateValidation: {
      enabled: {
        type: Boolean,
        default: true
      },
      checkCertificate: {
        type: Boolean,
        default: true
      },
      allowSelfSigned: {
        type: Boolean,
        default: false
      },
      certificateFingerprints: [String]
    }
  },

  // ==================== Pattern Configuration ====================
  patternConfig: {
    regex: {
      type: String,
      validate: {
        validator: function(value) {
          if (!value) return true;
          try {
            new RegExp(value);
            return true;
          } catch {
            return false;
          }
        },
        message: 'Invalid regular expression pattern'
      }
    },
    flags: {
      type: String,
      default: 'i',
      validate: {
        validator: function(value) {
          return /^[gimuy]*$/.test(value);
        },
        message: 'Invalid regex flags'
      }
    },
    testCases: [{
      input: {
        type: String,
        required: true
      },
      expected: {
        type: Boolean,
        required: true
      },
      description: String,
      lastTested: Date,
      testResult: Boolean
    }],
    compiledPattern: {
      type: String
    },
    performance: {
      averageExecutionTime: Number,
      maxExecutionTime: Number,
      minExecutionTime: Number,
      totalExecutions: {
        type: Number,
        default: 0
      }
    }
  },

  // ==================== Wildcard and Subdomain Configuration ====================
  wildcardConfig: {
    baseDomain: {
      type: String,
      validate: {
        validator: validateDomain,
        message: 'Invalid base domain format'
      }
    },
    allowSubdomains: {
      type: Boolean,
      default: true
    },
    maxSubdomainDepth: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    },
    excludedSubdomains: [String],
    requiredSubdomainPatterns: [String]
  },

  // ==================== Usage Statistics & Analytics ====================
  stats: {
    requestCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lastUsed: {
      type: Date,
      index: true
    },
    successCount: {
      type: Number,
      default: 0,
      min: 0
    },
    failureCount: {
      type: Number,
      default: 0,
      min: 0
    },
    averageResponseTime: {
      type: Number,
      min: 0
    },
    peakRequestsPerHour: {
      type: Number,
      default: 0
    },
    dailyStats: [{
      date: {
        type: Date,
        required: true
      },
      requests: {
        type: Number,
        default: 0
      },
      successes: {
        type: Number,
        default: 0
      },
      failures: {
        type: Number,
        default: 0
      },
      averageResponseTime: Number,
      uniqueIPs: {
        type: Number,
        default: 0
      }
    }],
    weeklyStats: [{
      weekStart: Date,
      totalRequests: Number,
      averageDaily: Number,
      peakDay: Date,
      peakRequests: Number
    }],
    monthlyStats: [{
      month: Date,
      totalRequests: Number,
      averageDaily: Number,
      peakDay: Date,
      peakRequests: Number,
      trendsAnalysis: {
        growth: Number,
        stability: Number,
        anomalies: [Date]
      }
    }],
    geolocation: {
      countries: [{
        code: String,
        name: String,
        requestCount: Number,
        percentage: Number
      }],
      regions: [{
        name: String,
        requestCount: Number,
        percentage: Number
      }]
    },
    userAgents: [{
      userAgent: String,
      count: Number,
      firstSeen: Date,
      lastSeen: Date
    }],
    referrers: [{
      referrer: String,
      count: Number,
      firstSeen: Date,
      lastSeen: Date
    }],
    errorAnalysis: {
      commonErrors: [{
        errorCode: String,
        count: Number,
        lastOccurrence: Date,
        description: String
      }],
      errorTrends: [{
        period: Date,
        errorRate: Number,
        primaryErrors: [String]
      }]
    }
  },

  // ==================== Performance Monitoring ====================
  performance: {
    monitoring: {
      enabled: {
        type: Boolean,
        default: true
      },
      sampleRate: {
        type: Number,
        default: 0.1,
        min: 0.01,
        max: 1.0
      }
    },
    thresholds: {
      responseTime: {
        warning: {
          type: Number,
          default: 500
        },
        critical: {
          type: Number,
          default: 2000
        }
      },
      errorRate: {
        warning: {
          type: Number,
          default: 0.05
        },
        critical: {
          type: Number,
          default: 0.1
        }
      },
      requestRate: {
        warning: {
          type: Number,
          default: 1000
        },
        critical: {
          type: Number,
          default: 5000
        }
      }
    },
    alerts: [{
      type: {
        type: String,
        enum: ['response_time', 'error_rate', 'request_rate', 'availability']
      },
      threshold: Number,
      triggeredAt: Date,
      resolvedAt: Date,
      notificationSent: {
        type: Boolean,
        default: false
      },
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      }
    }],
    healthChecks: {
      lastCheck: Date,
      status: {
        type: String,
        enum: ['healthy', 'warning', 'critical', 'unknown'],
        default: 'unknown'
      },
      checks: [{
        name: String,
        status: Boolean,
        message: String,
        timestamp: Date,
        duration: Number
      }],
      availability: {
        uptime: Number,
        downtimeEvents: [{
          start: Date,
          end: Date,
          duration: Number,
          reason: String
        }]
      }
    }
  },

  // ==================== Metadata & Configuration ====================
  metadata: {
    description: {
      type: String,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [50, 'Tag cannot exceed 50 characters']
    }],
    source: {
      type: String,
      enum: ['manual', 'import', 'api', 'auto_detected', 'migration', 'template', 'bulk_operation'],
      default: 'manual',
      index: true
    },
    sourceDetails: {
      importFile: String,
      importBatch: String,
      apiEndpoint: String,
      apiVersion: String,
      detectionMethod: String,
      detectionConfidence: {
        type: Number,
        min: 0,
        max: 1
      },
      migrationScript: String,
      migrationVersion: String,
      templateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OriginTemplate'
      },
      bulkOperationId: String
    },
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      validate: {
        validator: function(value) {
          return value.size <= 50;
        },
        message: 'Cannot have more than 50 custom fields'
      }
    },
    labels: {
      type: Map,
      of: String
    },
    annotations: {
      type: Map,
      of: String
    },
    notes: [{
      content: {
        type: String,
        required: true,
        maxlength: [2000, 'Note cannot exceed 2000 characters']
      },
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      addedAt: {
        type: Date,
        default: Date.now
      },
      category: {
        type: String,
        enum: ['general', 'security', 'performance', 'compliance', 'maintenance', 'incident'],
        default: 'general'
      },
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      isResolved: {
        type: Boolean,
        default: false
      },
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      resolvedAt: Date
    }],
    documentation: {
      links: [{
        title: String,
        url: String,
        type: {
          type: String,
          enum: ['documentation', 'specification', 'guide', 'example', 'reference']
        }
      }],
      internalDocs: [{
        title: String,
        documentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Document'
        },
        version: String,
        lastUpdated: Date
      }]
    }
  },

  // ==================== Ownership & Management ====================
  ownership: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator is required'],
      immutable: true
    },
    managedBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      role: {
        type: String,
        enum: ['owner', 'admin', 'manager', 'viewer', 'contributor'],
        default: 'manager'
      },
      permissions: [{
        type: String,
        enum: ['read', 'write', 'delete', 'manage_users', 'approve', 'audit']
      }],
      addedAt: {
        type: Date,
        default: Date.now
      },
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      expiresAt: Date,
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    },
    department: {
      type: String,
      trim: true
    },
    project: {
      type: String,
      trim: true
    },
    costCenter: {
      type: String,
      trim: true
    },
    environment: {
      type: String,
      enum: ['development', 'staging', 'production', 'testing', 'integration', 'sandbox'],
      default: function() {
        return process.env.NODE_ENV || 'development';
      },
      index: true
    },
    region: {
      type: String,
      enum: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', 'global'],
      default: 'global'
    },
    businessUnit: {
      type: String,
      trim: true
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application'
    }
  },

  // ==================== Compliance & Audit ====================
  compliance: {
    requiresApproval: {
      type: Boolean,
      default: function() {
        return this.ownership.environment === 'production';
      }
    },
    approvalWorkflow: {
      workflowId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workflow'
      },
      currentStep: String,
      pendingApprovers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      escalationPath: [{
        level: Number,
        approvers: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }],
        timeoutHours: {
          type: Number,
          default: 24
        }
      }]
    },
    approvals: [{
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      approvedAt: {
        type: Date,
        default: Date.now
      },
      reason: {
        type: String,
        required: true
      },
      expiresAt: Date,
      conditions: [String],
      digitalSignature: String,
      approvalLevel: {
        type: String,
        enum: ['manager', 'senior_manager', 'director', 'vp', 'ciso'],
        required: true
      }
    }],
    auditTrail: [{
      action: {
        type: String,
        enum: [
          'create', 'update', 'delete', 'activate', 'deactivate', 
          'approve', 'reject', 'suspend', 'restore', 'archive',
          'export', 'import', 'test', 'validate'
        ],
        required: true
      },
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      performedAt: {
        type: Date,
        default: Date.now
      },
      details: {
        type: mongoose.Schema.Types.Mixed,
        required: true
      },
      ipAddress: {
        type: String,
        validate: {
          validator: function(value) {
            return !value || validateIP(value);
          },
          message: 'Invalid IP address'
        }
      },
      userAgent: String,
      sessionId: String,
      correlationId: String,
      changeSet: [{
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed
      }],
      riskAssessment: {
        level: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical']
        },
        factors: [String],
        mitigations: [String]
      }
    }],
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true
    },
    riskFactors: [{
      factor: String,
      weight: {
        type: Number,
        min: 0,
        max: 1
      },
      assessment: String,
      mitigated: {
        type: Boolean,
        default: false
      }
    }],
    complianceFrameworks: [{
      framework: {
        type: String,
        enum: ['SOX', 'PCI-DSS', 'HIPAA', 'GDPR', 'SOC2', 'ISO27001', 'NIST', 'custom']
      },
      requirements: [String],
      status: {
        type: String,
        enum: ['compliant', 'non_compliant', 'partial', 'not_applicable'],
        default: 'not_applicable'
      },
      lastAssessment: Date,
      assessedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      findings: [String],
      remediation: [String]
    }],
    lastReviewed: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    nextReview: {
      type: Date,
      index: true
    },
    reviewFrequency: {
      type: String,
      enum: ['weekly', 'monthly', 'quarterly', 'semi-annually', 'annually'],
      default: 'quarterly'
    },
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'internal'
    },
    retentionPolicy: {
      period: {
        type: Number,
        default: 2555
      },
      unit: {
        type: String,
        enum: ['days', 'months', 'years'],
        default: 'days'
      },
      autoDelete: {
        type: Boolean,
        default: false
      }
    }
  },

  // ==================== Integration & Automation ====================
  integration: {
    webhooks: [{
      url: {
        type: String,
        validate: {
          validator: function(value) {
            try {
              const url = new URL(value);
              return ['http:', 'https:'].includes(url.protocol);
            } catch {
              return false;
            }
          },
          message: 'Invalid webhook URL'
        }
      },
      events: [{
        type: String,
        enum: ['created', 'updated', 'deleted', 'activated', 'deactivated', 'expired', 'approved']
      }],
      isActive: {
        type: Boolean,
        default: true
      },
      secret: String,
      timeout: {
        type: Number,
        default: 30000,
        min: 1000,
        max: 300000
      },
      retries: {
        type: Number,
        default: 3,
        min: 0,
        max: 10
      },
      lastTriggered: Date,
      statistics: {
        successCount: {
          type: Number,
          default: 0
        },
        failureCount: {
          type: Number,
          default: 0
        },
        averageResponseTime: Number
      }
    }],
    apiIntegrations: [{
      service: String,
      endpoint: String,
      method: {
        type: String,
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        default: 'POST'
      },
      authentication: {
        type: {
          type: String,
          enum: ['none', 'basic', 'bearer', 'api_key', 'oauth2']
        },
        credentials: {
          type: String,
          select: false
        }
      },
      mapping: {
        type: Map,
        of: String
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    monitoring: {
      tools: [String],
      dashboards: [{
        name: String,
        url: String,
        type: {
          type: String,
          enum: ['grafana', 'datadog', 'new_relic', 'custom']
        }
      }],
      alerts: [{
        condition: String,
        threshold: mongoose.Schema.Types.Mixed,
        channels: [String],
        isActive: {
          type: Boolean,
          default: true
        }
      }]
    }
  },

  // ==================== Backup & Recovery ====================
  backup: {
    strategy: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly', 'on_change'],
      default: 'weekly'
    },
    retention: {
      count: {
        type: Number,
        default: 4,
        min: 1,
        max: 100
      },
      period: {
        type: Number,
        default: 90
      }
    },
    location: {
      type: String,
      enum: ['local', 's3', 'gcs', 'azure', 'custom'],
      default: 'local'
    },
    encryption: {
      enabled: {
        type: Boolean,
        default: true
      },
      algorithm: {
        type: String,
        default: 'AES-256-GCM'
      }
    },
    lastBackup: Date,
    nextBackup: Date,
    backupSize: Number,
    backupHistory: [{
      timestamp: Date,
      size: Number,
      location: String,
      checksum: String,
      status: {
        type: String,
        enum: ['success', 'failed', 'partial']
      },
      duration: Number
    }]
  },

  // ==================== Cache Configuration ====================
  caching: {
    enabled: {
      type: Boolean,
      default: true
    },
    ttl: {
      type: Number,
      default: 3600,
      min: 60,
      max: 86400
    },
    strategy: {
      type: String,
      enum: ['lru', 'lfu', 'fifo', 'ttl'],
      default: 'lru'
    },
    maxSize: {
      type: Number,
      default: 1000,
      min: 10,
      max: 100000
    },
    warmup: {
      enabled: {
        type: Boolean,
        default: false
      },
      schedule: String,
      priority: {
        type: Number,
        default: 1,
        min: 1,
        max: 10
      }
    },
    invalidation: {
      events: [String],
      patterns: [String],
      dependencies: [String]
    },
    statistics: {
      hitRate: Number,
      missRate: Number,
      lastCleared: Date,
      totalHits: {
        type: Number,
        default: 0
      },
      totalMisses: {
        type: Number,
        default: 0
      }
    }
  },

  // ==================== Feature Flags ====================
  features: {
    enabledFeatures: [{
      type: String,
      enum: [
        'rate_limiting', 'geo_blocking', 'user_agent_filtering',
        'referrer_validation', 'certificate_pinning', 'hsts',
        'content_security_policy', 'feature_policy'
      ]
    }],
    experimentalFeatures: [{
      name: String,
      enabled: {
        type: Boolean,
        default: false
      },
      rollout: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      enabledAt: Date,
      enabledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    deprecatedFeatures: [{
      name: String,
      deprecatedAt: Date,
      removalDate: Date,
      reason: String,
      migration: String
    }]
  }
};

// Create schema with comprehensive options
const corsWhitelistSchema = BaseModel.createSchema(corsWhitelistSchemaDefinition, {
  collection: 'cors_whitelist',
  timestamps: true,
  strict: true,
  validateBeforeSave: true,
  versionKey: '__v',
  minimize: false,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.security?.certificateValidation?.certificateFingerprints;
      delete ret.integration?.apiIntegrations?.authentication?.credentials;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// ==================== Comprehensive Indexes ====================
// Primary functional indexes
corsWhitelistSchema.index({ organizationId: 1, isActive: 1 });
corsWhitelistSchema.index({ organizationId: 1, tenantId: 1, isActive: 1 });
corsWhitelistSchema.index({ type: 1, isActive: 1 });
corsWhitelistSchema.index({ origin: 1, organizationId: 1 }, { unique: true });
corsWhitelistSchema.index({ originHash: 1 }, { unique: true, sparse: true });

// Performance and query optimization indexes
corsWhitelistSchema.index({ priority: -1, weight: -1 });
corsWhitelistSchema.index({ expiryDate: 1 }, { sparse: true });
corsWhitelistSchema.index({ 'stats.lastUsed': -1 });
corsWhitelistSchema.index({ 'ownership.environment': 1, isActive: 1 });
corsWhitelistSchema.index({ 'compliance.nextReview': 1 }, { sparse: true });
corsWhitelistSchema.index({ 'compliance.riskLevel': 1 });
corsWhitelistSchema.index({ effectiveDate: 1 });

// Administrative and audit indexes
corsWhitelistSchema.index({ 'ownership.createdBy': 1, createdAt: -1 });
corsWhitelistSchema.index({ 'metadata.source': 1, createdAt: -1 });
corsWhitelistSchema.index({ 'metadata.tags': 1 });

// Compound performance indexes
corsWhitelistSchema.index({ 
  organizationId: 1, 
  type: 1, 
  isActive: 1, 
  priority: -1 
});

corsWhitelistSchema.index({ 
  'ownership.environment': 1, 
  'compliance.riskLevel': 1, 
  isActive: 1 
});

// Text search index with weights
corsWhitelistSchema.index({
  origin: 'text',
  'metadata.description': 'text',
  'metadata.tags': 'text',
  'wildcardConfig.baseDomain': 'text'
}, {
  weights: {
    origin: 10,
    'wildcardConfig.baseDomain': 8,
    'metadata.tags': 5,
    'metadata.description': 2
  },
  name: 'cors_whitelist_text_search'
});

// ==================== Virtual Fields ====================
corsWhitelistSchema.virtual('isExpired').get(function() {
  return this.expiryDate && this.expiryDate <= new Date();
});

corsWhitelistSchema.virtual('isEffective').get(function() {
  const now = new Date();
  return this.isActive && 
         this.effectiveDate <= now && 
         (!this.expiryDate || this.expiryDate > now);
});

corsWhitelistSchema.virtual('domain').get(function() {
  try {
    return new URL(this.origin).hostname;
  } catch {
    return null;
  }
});

corsWhitelistSchema.virtual('protocol').get(function() {
  try {
    return new URL(this.origin).protocol;
  } catch {
    return null;
  }
});

corsWhitelistSchema.virtual('port').get(function() {
  try {
    return new URL(this.origin).port || (this.protocol === 'https:' ? 443 : 80);
  } catch {
    return null;
  }
});

corsWhitelistSchema.virtual('isSecure').get(function() {
  return this.origin.startsWith('https://');
});

corsWhitelistSchema.virtual('needsReview').get(function() {
  return this.compliance.nextReview && this.compliance.nextReview <= new Date();
});

corsWhitelistSchema.virtual('isHighRisk').get(function() {
  return ['high', 'critical'].includes(this.compliance.riskLevel);
});

corsWhitelistSchema.virtual('successRate').get(function() {
  const total = this.stats.successCount + this.stats.failureCount;
  return total > 0 ? (this.stats.successCount / total) * 100 : 0;
});

corsWhitelistSchema.virtual('requestsPerDay').get(function() {
  const daysSinceCreation = Math.max(1, (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  return Math.round(this.stats.requestCount / daysSinceCreation);
});

corsWhitelistSchema.virtual('healthStatus').get(function() {
  if (!this.performance.healthChecks.lastCheck) return 'unknown';
  
  const hoursAgo = (Date.now() - this.performance.healthChecks.lastCheck.getTime()) / (1000 * 60 * 60);
  if (hoursAgo > 24) return 'stale';
  
  return this.performance.healthChecks.status;
});

corsWhitelistSchema.virtual('complianceScore').get(function() {
  let score = 100;
  
  if (this.compliance.riskLevel === 'high') score -= 20;
  if (this.compliance.riskLevel === 'critical') score -= 40;
  if (!this.isSecure && this.ownership.environment === 'production') score -= 15;
  if (this.needsReview) score -= 10;
  if (!this.compliance.approvals.length && this.compliance.requiresApproval) score -= 25;
  
  return Math.max(0, score);
});

// ==================== Pre-save Middleware ====================
corsWhitelistSchema.pre('save', async function(next) {
  try {
    // Generate origin hash for uniqueness and indexing
    if (this.isModified('origin') || this.isNew) {
      this.originHash = generateHash(this.origin + this.organizationId.toString());
    }

    // Validate pattern if type is pattern
    if (this.type === 'pattern' && this.patternConfig?.regex) {
      try {
        const compiledPattern = new RegExp(this.patternConfig.regex, this.patternConfig.flags);
        this.patternConfig.compiledPattern = compiledPattern.toString();
      } catch (error) {
        throw new AppError(`Invalid regex pattern: ${error.message}`, 400, 'INVALID_PATTERN');
      }
    }

    // Validate wildcard configuration
    if (this.type === 'wildcard' || this.type === 'subdomain') {
      if (!this.wildcardConfig.baseDomain) {
        this.wildcardConfig.baseDomain = this.domain;
      }
    }

    // Set security defaults based on environment
    if (this.isNew || this.isModified('origin') || this.isModified('ownership.environment')) {
      if (this.ownership.environment === 'production' && !this.origin.startsWith('https://')) {
        // Allow localhost and development domains in production for testing
        if (!this.origin.includes('localhost') && 
            !this.origin.includes('127.0.0.1') && 
            !this.origin.includes('.dev') &&
            !this.origin.includes('.local')) {
          this.security.requireHTTPS = true;
        }
      }
    }

    // Set approval requirements based on environment and risk level
    if (this.isNew || this.isModified('ownership.environment') || this.isModified('compliance.riskLevel')) {
      this.compliance.requiresApproval = 
        this.ownership.environment === 'production' || 
        ['high', 'critical'].includes(this.compliance.riskLevel);
    }

    // Set next review date if not specified
    if (!this.compliance.nextReview && this.isActive) {
      const reviewIntervals = {
        'weekly': 7,
        'monthly': 30,
        'quarterly': 90,
        'semi-annually': 180,
        'annually': 365
      };
      
      const days = reviewIntervals[this.compliance.reviewFrequency] || 90;
      this.compliance.nextReview = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    // Auto-renewal logic
    if (this.autoRenew.enabled && this.expiryDate && this.expiryDate <= new Date()) {
      if (this.autoRenew.currentRenewals < this.autoRenew.maxRenewals) {
        const intervals = {
          'monthly': 30,
          'quarterly': 90,
          'semi-annually': 180,
          'annually': 365
        };
        
        const days = intervals[this.autoRenew.interval] || 90;
        this.expiryDate = new Date(this.expiryDate.getTime() + days * 24 * 60 * 60 * 1000);
        this.autoRenew.currentRenewals += 1;
        
        logger.info('Origin auto-renewed', {
          originId: this._id,
          origin: this.origin,
          newExpiryDate: this.expiryDate,
          renewalCount: this.autoRenew.currentRenewals
        });
      }
    }

    // Sanitize input data
    if (this.metadata.description) {
      this.metadata.description = sanitizeInput(this.metadata.description);
    }

    // Add audit trail entry
    if (this.isModified()) {
      const action = this.isNew ? 'create' : 'update';
      const modifiedPaths = this.modifiedPaths();
      
      this.compliance.auditTrail.push({
        action,
        performedBy: this.ownership.createdBy,
        details: {
          modifiedFields: modifiedPaths,
          isNew: this.isNew,
          changeReason: this.changeReason || 'Standard update'
        },
        changeSet: modifiedPaths.map(path => ({
          field: path,
          oldValue: this.isNew ? null : this.get(path),
          newValue: this.get(path)
        }))
      });
    }

    // Performance tracking initialization
    if (this.isNew) {
      this.performance.healthChecks.status = 'unknown';
      this.performance.healthChecks.lastCheck = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Post-save Middleware ====================
corsWhitelistSchema.post('save', async function(doc) {
  try {
    // Create audit log entry
    const AuditLog = mongoose.model('AuditLog');
    await AuditLog.logEvent({
      tenantId: doc.tenantId,
      organizationId: doc.organizationId,
      event: {
        type: 'cors_whitelist_updated',
        category: 'security',
        action: doc.isNew ? 'create' : 'update',
        description: `CORS origin ${doc.origin} ${doc.isNew ? 'added' : 'updated'}`,
        severity: doc.compliance.riskLevel === 'critical' ? 'high' : 'info'
      },
      actor: {
        userId: doc.ownership.createdBy,
        userType: 'user'
      },
      resource: {
        type: 'cors_whitelist',
        id: doc._id.toString(),
        name: doc.origin
      },
      security: {
        origin: doc.origin,
        type: doc.type,
        environment: doc.ownership.environment,
        riskLevel: doc.compliance.riskLevel
      }
    });

    // Send notifications for high-risk origins
    if (doc.isNew && ['high', 'critical'].includes(doc.compliance.riskLevel)) {
      await NotificationService.sendAlert({
        type: 'high_risk_origin_added',
        severity: doc.compliance.riskLevel,
        origin: doc.origin,
        organizationId: doc.organizationId,
        recipients: await this.constructor.getSecurityTeamEmails(doc.organizationId)
      });
    }

    // Update metrics
    await MetricsService.incrementCounter('cors_whitelist_operations', {
      operation: doc.isNew ? 'create' : 'update',
      environment: doc.ownership.environment,
      type: doc.type,
      risk_level: doc.compliance.riskLevel
    });

    // Trigger webhooks
    if (doc.integration?.webhooks?.length > 0) {
      for (const webhook of doc.integration.webhooks) {
        if (webhook.isActive && webhook.events.includes(doc.isNew ? 'created' : 'updated')) {
          await this.constructor.triggerWebhook(webhook, doc, doc.isNew ? 'created' : 'updated');
        }
      }
    }

  } catch (error) {
    logger.error('Error in CORS whitelist post-save hook', {
      whitelistId: doc._id,
      origin: doc.origin,
      error: error.message
    });
  }
});

// ==================== Pre-remove Middleware ====================
corsWhitelistSchema.pre('remove', async function(next) {
  try {
    // Archive before deletion
    const ArchiveModel = mongoose.model('ArchivedCorsWhitelist');
    await ArchiveModel.create({
      ...this.toObject(),
      archivedAt: new Date(),
      archivedReason: 'deleted'
    });

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================

/**
 * Activates the origin with comprehensive validation
 */
corsWhitelistSchema.methods.activate = async function(activatedBy, options = {}) {
  if (this.isActive) {
    throw new AppError('Origin is already active', 400, 'ALREADY_ACTIVE');
  }

  // Validate activation requirements
  if (this.compliance.requiresApproval && !this.compliance.approvals.length) {
    throw new AppError('Origin requires approval before activation', 403, 'APPROVAL_REQUIRED');
  }

  // Check for conflicts
  const conflicts = await this.constructor.findConflicts(this.origin, this.organizationId, this._id);
  if (conflicts.length > 0) {
    throw new AppError('Origin conflicts with existing entries', 409, 'ORIGIN_CONFLICT');
  }

  this.isActive = true;
  
  this.compliance.auditTrail.push({
    action: 'activate',
    performedBy: activatedBy,
    details: { 
      reason: options.reason || 'Origin activated',
      validationsPassed: true
    }
  });

  await this.save();
  
  logger.info('CORS origin activated', {
    whitelistId: this._id,
    origin: this.origin,
    activatedBy,
    environment: this.ownership.environment
  });

  return this;
};

/**
 * Deactivates the origin with audit trail
 */
corsWhitelistSchema.methods.deactivate = async function(deactivatedBy, reason, options = {}) {
  if (!this.isActive) {
    throw new AppError('Origin is already inactive', 400, 'ALREADY_INACTIVE');
  }

  this.isActive = false;
  
  if (options.suspend) {
    this.metadata.suspended = {
      suspendedAt: new Date(),
      suspendedBy: deactivatedBy,
      reason,
      duration: options.duration
    };
  }
  
  this.compliance.auditTrail.push({
    action: options.suspend ? 'suspend' : 'deactivate',
    performedBy: deactivatedBy,
    details: { reason, suspended: options.suspend }
  });

  await this.save();
  
  logger.info('CORS origin deactivated', {
    whitelistId: this._id,
    origin: this.origin,
    reason,
    suspended: options.suspend
  });

  return this;
};

/**
 * Updates usage statistics with comprehensive tracking
 */
corsWhitelistSchema.methods.updateStats = async function(success = true, responseTime, metadata = {}) {
  const now = new Date();
  
  this.stats.requestCount += 1;
  this.stats.lastUsed = now;
  
  if (success) {
    this.stats.successCount += 1;
  } else {
    this.stats.failureCount += 1;
  }

  // Update response time statistics
  if (responseTime !== undefined) {
    if (!this.stats.averageResponseTime) {
      this.stats.averageResponseTime = responseTime;
    } else {
      const count = this.stats.requestCount;
      this.stats.averageResponseTime = 
        ((this.stats.averageResponseTime * (count - 1)) + responseTime) / count;
    }
  }

  // Update daily statistics
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let dailyStat = this.stats.dailyStats.find(stat => 
    stat.date.getTime() === today.getTime()
  );
  
  if (!dailyStat) {
    dailyStat = {
      date: today,
      requests: 0,
      successes: 0,
      failures: 0,
      uniqueIPs: 0
    };
    this.stats.dailyStats.push(dailyStat);
    
    // Keep only last 90 days
    this.stats.dailyStats = this.stats.dailyStats
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 90);
  }
  
  dailyStat.requests += 1;
  if (success) {
    dailyStat.successes += 1;
  } else {
    dailyStat.failures += 1;
  }
  
  if (responseTime !== undefined) {
    if (!dailyStat.averageResponseTime) {
      dailyStat.averageResponseTime = responseTime;
    } else {
      dailyStat.averageResponseTime = 
        ((dailyStat.averageResponseTime * (dailyStat.requests - 1)) + responseTime) / dailyStat.requests;
    }
  }

  // Track geolocation if provided
  if (metadata.country) {
    let countrystat = this.stats.geolocation.countries.find(c => c.code === metadata.country);
    if (!countrystat) {
      countrystat = {
        code: metadata.country,
        name: metadata.countryName || metadata.country,
        requestCount: 0,
        percentage: 0
      };
      this.stats.geolocation.countries.push(countrystat);
    }
    countrystat.requestCount += 1;
    countrystat.percentage = (countrystat.requestCount / this.stats.requestCount) * 100;
  }

  // Track user agent if provided
  if (metadata.userAgent) {
    let uaStat = this.stats.userAgents.find(ua => ua.userAgent === metadata.userAgent);
    if (!uaStat) {
      uaStat = {
        userAgent: metadata.userAgent,
        count: 0,
        firstSeen: now,
        lastSeen: now
      };
      this.stats.userAgents.push(uaStat);
      
      // Keep only top 50 user agents
      this.stats.userAgents = this.stats.userAgents
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);
    } else {
      uaStat.lastSeen = now;
    }
    uaStat.count += 1;
  }

  // Performance monitoring
  if (responseTime !== undefined) {
    const warningThreshold = this.performance.thresholds.responseTime.warning;
    const criticalThreshold = this.performance.thresholds.responseTime.critical;
    
    if (responseTime > criticalThreshold) {
      this.performance.alerts.push({
        type: 'response_time',
        threshold: criticalThreshold,
        triggeredAt: now,
        severity: 'critical'
      });
    } else if (responseTime > warningThreshold) {
      this.performance.alerts.push({
        type: 'response_time',
        threshold: warningThreshold,
        triggeredAt: now,
        severity: 'warning'
      });
    }
  }

  await this.save({ timestamps: false });
  
  return this;
};

/**
 * Tests pattern against given origin with performance tracking
 */
corsWhitelistSchema.methods.testPattern = function(testOrigin) {
  if (this.type !== 'pattern' || !this.patternConfig?.regex) {
    throw new AppError('This is not a pattern-type origin', 400, 'NOT_PATTERN_TYPE');
  }

  const startTime = process.hrtime.bigint();
  let result = false;
  
  try {
    const regex = new RegExp(this.patternConfig.regex, this.patternConfig.flags);
    result = regex.test(testOrigin);
    
    // Update performance statistics
    const executionTime = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to milliseconds
    
    if (!this.patternConfig.performance) {
      this.patternConfig.performance = {
        averageExecutionTime: executionTime,
        maxExecutionTime: executionTime,
        minExecutionTime: executionTime,
        totalExecutions: 1
      };
    } else {
      const perf = this.patternConfig.performance;
      perf.totalExecutions += 1;
      perf.averageExecutionTime = ((perf.averageExecutionTime * (perf.totalExecutions - 1)) + executionTime) / perf.totalExecutions;
      perf.maxExecutionTime = Math.max(perf.maxExecutionTime, executionTime);
      perf.minExecutionTime = Math.min(perf.minExecutionTime, executionTime);
    }
    
    return result;
  } catch (error) {
    logger.error('Error testing pattern', {
      whitelistId: this._id,
      pattern: this.patternConfig.regex,
      testOrigin,
      error: error.message
    });
    return false;
  }
};

/**
 * Performs comprehensive health check
 */
corsWhitelistSchema.methods.performHealthCheck = async function() {
  const checks = [];
  const startTime = Date.now();
  
  try {
    // Basic validation check
    const validationCheck = {
      name: 'validation',
      status: true,
      message: 'Origin format is valid',
      timestamp: new Date(),
      duration: 0
    };
    
    try {
      new URL(this.origin);
    } catch (error) {
      validationCheck.status = false;
      validationCheck.message = `Invalid origin format: ${error.message}`;
    }
    
    checks.push(validationCheck);

    // DNS resolution check
    if (this.domain) {
      const dnsCheck = {
        name: 'dns_resolution',
        status: false,
        message: 'DNS resolution failed',
        timestamp: new Date(),
        duration: 0
      };
      
      const dnsStart = Date.now();
      try {
        await dns.lookup(this.domain);
        dnsCheck.status = true;
        dnsCheck.message = 'DNS resolution successful';
      } catch (error) {
        dnsCheck.message = `DNS resolution failed: ${error.message}`;
      }
      dnsCheck.duration = Date.now() - dnsStart;
      
      checks.push(dnsCheck);
    }

    // Certificate validation check for HTTPS origins
    if (this.isSecure && this.security.certificateValidation.enabled) {
      const certCheck = {
        name: 'certificate_validation',
        status: true,
        message: 'Certificate validation skipped in health check',
        timestamp: new Date(),
        duration: 0
      };
      checks.push(certCheck);
    }

    // Pattern validation check for pattern types
    if (this.type === 'pattern' && this.patternConfig?.regex) {
      const patternCheck = {
        name: 'pattern_validation',
        status: true,
        message: 'Pattern compilation successful',
        timestamp: new Date(),
        duration: 0
      };
      
      try {
        new RegExp(this.patternConfig.regex, this.patternConfig.flags);
      } catch (error) {
        patternCheck.status = false;
        patternCheck.message = `Pattern compilation failed: ${error.message}`;
      }
      
      checks.push(patternCheck);
    }

    // Update health status
    const allPassed = checks.every(check => check.status);
    const criticalFailed = checks.some(check => !check.status && ['validation', 'dns_resolution'].includes(check.name));
    
    this.performance.healthChecks = {
      lastCheck: new Date(),
      status: criticalFailed ? 'critical' : (allPassed ? 'healthy' : 'warning'),
      checks
    };

    await this.save({ timestamps: false });
    
    logger.info('Health check completed', {
      whitelistId: this._id,
      origin: this.origin,
      status: this.performance.healthChecks.status,
      duration: Date.now() - startTime
    });

    return this.performance.healthChecks;
    
  } catch (error) {
    logger.error('Health check failed', {
      whitelistId: this._id,
      origin: this.origin,
      error: error.message
    });
    
    this.performance.healthChecks = {
      lastCheck: new Date(),
      status: 'critical',
      checks: [{
        name: 'health_check_error',
        status: false,
        message: error.message,
        timestamp: new Date(),
        duration: Date.now() - startTime
      }]
    };
    
    await this.save({ timestamps: false });
    throw error;
  }
};

/**
 * Adds a note with comprehensive metadata
 */
corsWhitelistSchema.methods.addNote = async function(content, addedBy, category = 'general', priority = 'medium') {
  const note = {
    content: sanitizeInput(content),
    addedBy,
    category,
    priority
  };

  this.metadata.notes.push(note);
  await this.save();
  
  logger.info('Note added to CORS origin', {
    whitelistId: this._id,
    origin: this.origin,
    noteCategory: category,
    notePriority: priority
  });
  
  return this.metadata.notes[this.metadata.notes.length - 1];
};

/**
 * Approves the origin with digital signature support
 */
corsWhitelistSchema.methods.approve = async function(approvedBy, reason, options = {}) {
  if (!this.compliance.requiresApproval) {
    throw new AppError('This origin does not require approval', 400, 'NO_APPROVAL_REQUIRED');
  }

  const approval = {
    approvedBy,
    approvedAt: new Date(),
    reason: sanitizeInput(reason),
    expiresAt: options.expiresAt,
    conditions: options.conditions || [],
    approvalLevel: options.approvalLevel || 'manager'
  };

  // Generate digital signature if enabled
  if (options.digitalSignature) {
    const signatureData = {
      originId: this._id.toString(),
      origin: this.origin,
      approvedBy: approvedBy.toString(),
      approvedAt: approval.approvedAt.toISOString(),
      reason
    };
    approval.digitalSignature = generateHash(JSON.stringify(signatureData));
  }

  this.compliance.approvals.push(approval);

  this.compliance.auditTrail.push({
    action: 'approve',
    performedBy: approvedBy,
    details: { 
      reason, 
      expiresAt: options.expiresAt,
      approvalLevel: options.approvalLevel,
      hasDigitalSignature: !!options.digitalSignature
    }
  });

  await this.save();
  
  logger.info('CORS origin approved', {
    whitelistId: this._id,
    origin: this.origin,
    approvedBy,
    approvalLevel: options.approvalLevel
  });

  // Send notification
  if (options.notify !== false) {
    await NotificationService.sendNotification({
      type: 'origin_approved',
      originId: this._id,
      origin: this.origin,
      approver: approvedBy,
      reason
    });
  }

  return this;
};

/**
 * Extends the expiry date with validation
 */
corsWhitelistSchema.methods.extend = async function(extendedBy, newExpiryDate, reason, options = {}) {
  if (newExpiryDate <= new Date()) {
    throw new AppError('New expiry date must be in the future', 400, 'INVALID_EXPIRY_DATE');
  }

  if (newExpiryDate <= this.expiryDate) {
    throw new AppError('New expiry date must be after current expiry date', 400, 'INVALID_EXTENSION');
  }

  const oldExpiryDate = this.expiryDate;
  this.expiryDate = newExpiryDate;
  
  // Reset auto-renewal counter if extended manually
  if (options.resetAutoRenewal) {
    this.autoRenew.currentRenewals = 0;
  }
  
  this.compliance.auditTrail.push({
    action: 'update',
    performedBy: extendedBy,
    details: { 
      field: 'expiryDate',
      oldValue: oldExpiryDate,
      newValue: newExpiryDate,
      reason: reason || 'Extended expiry date',
      extensionDays: Math.round((newExpiryDate - oldExpiryDate) / (1000 * 60 * 60 * 24))
    }
  });

  await this.save();
  
  logger.info('CORS origin extended', {
    whitelistId: this._id,
    origin: this.origin,
    oldExpiryDate,
    newExpiryDate,
    extensionDays: Math.round((newExpiryDate - oldExpiryDate) / (1000 * 60 * 60 * 24))
  });

  return this;
};

/**
 * Generates comprehensive analytics report
 */
corsWhitelistSchema.methods.generateAnalyticsReport = async function(period = 'month') {
  const now = new Date();
  const periods = {
    'day': 1,
    'week': 7,
    'month': 30,
    'quarter': 90,
    'year': 365
  };
  
  const days = periods[period] || 30;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  
  const report = {
    origin: this.origin,
    period,
    startDate,
    endDate: now,
    summary: {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      averageResponseTime: this.stats.averageResponseTime,
      successRate: this.successRate,
      requestsPerDay: 0
    },
    trends: {
      daily: [],
      weekly: [],
      topCountries: [],
      topUserAgents: [],
      errorAnalysis: this.stats.errorAnalysis
    },
    performance: {
      healthStatus: this.healthStatus,
      lastHealthCheck: this.performance.healthChecks.lastCheck,
      alerts: this.performance.alerts.filter(alert => alert.triggeredAt >= startDate),
      thresholds: this.performance.thresholds
    },
    compliance: {
      riskLevel: this.compliance.riskLevel,
      lastReviewed: this.compliance.lastReviewed,
      nextReview: this.compliance.nextReview,
      approvalStatus: this.compliance.approvals.length > 0 ? 'approved' : 'pending'
    }
  };

  // Calculate daily trends
  const relevantDailyStats = this.stats.dailyStats.filter(stat => stat.date >= startDate);
  report.summary.totalRequests = relevantDailyStats.reduce((sum, stat) => sum + stat.requests, 0);
  report.summary.successRequests = relevantDailyStats.reduce((sum, stat) => sum + stat.successes, 0);
  report.summary.failedRequests = relevantDailyStats.reduce((sum, stat) => sum + stat.failures, 0);
  report.summary.requestsPerDay = report.summary.totalRequests / Math.max(1, relevantDailyStats.length);

  report.trends.daily = relevantDailyStats.map(stat => ({
    date: stat.date,
    requests: stat.requests,
    successRate: stat.requests > 0 ? (stat.successes / stat.requests) * 100 : 0,
    averageResponseTime: stat.averageResponseTime
  }));

  // Top countries (last 30 days of data)
  report.trends.topCountries = this.stats.geolocation.countries
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, 10);

  // Top user agents
  report.trends.topUserAgents = this.stats.userAgents
    .filter(ua => ua.lastSeen >= startDate)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  logger.info('Analytics report generated', {
    whitelistId: this._id,
    origin: this.origin,
    period,
    totalRequests: report.summary.totalRequests
  });

  return report;
};

// ==================== Static Methods ====================

/**
 * Creates a new origin with comprehensive validation
 */
corsWhitelistSchema.statics.createOrigin = async function(originData) {
  // Validate required fields
  if (!originData.origin || !originData.organizationId || !originData.ownership?.createdBy) {
    throw new AppError('Missing required fields: origin, organizationId, or createdBy', 400, 'MISSING_REQUIRED_FIELDS');
  }

  // Check for duplicates
  const existing = await this.findByOrigin(originData.origin, originData.organizationId);
  if (existing) {
    throw new AppError('Origin already exists for this organization', 409, 'DUPLICATE_ORIGIN');
  }

  const origin = new this(originData);
  await origin.save();
  
  logger.info('CORS origin created', {
    whitelistId: origin._id,
    origin: origin.origin,
    type: origin.type,
    environment: origin.ownership.environment
  });
  
  return origin;
};

/**
 * Finds all active origins for organization with optional tenant filtering
 */
corsWhitelistSchema.statics.findActiveOrigins = async function(organizationId, tenantId = null, options = {}) {
  const query = {
    organizationId: new mongoose.Types.ObjectId(organizationId),
    isActive: true,
    $or: [
      { expiryDate: { $exists: false } },
      { expiryDate: { $gt: new Date() } }
    ]
  };

  // Add tenant filtering
  if (tenantId) {
    query.$or = [
      { tenantId: new mongoose.Types.ObjectId(tenantId) },
      { tenantId: null } // Include global origins
    ];
  } else {
    query.tenantId = null; // Only global origins
  }

  // Add environment filtering
  if (options.environment) {
    query['ownership.environment'] = options.environment;
  }

  // Add type filtering
  if (options.type) {
    query.type = options.type;
  }

  let queryBuilder = this.find(query);

  // Apply sorting
  const sortOptions = options.sort || { priority: -1, weight: -1, createdAt: -1 };
  queryBuilder = queryBuilder.sort(sortOptions);

  // Apply pagination
  if (options.limit) {
    queryBuilder = queryBuilder.limit(options.limit);
  }
  
  if (options.skip) {
    queryBuilder = queryBuilder.skip(options.skip);
  }

  // Apply population
  if (options.populate) {
    queryBuilder = queryBuilder.populate(options.populate);
  }

  return await queryBuilder.exec();
};

/**
 * Finds origin by exact match
 */
corsWhitelistSchema.statics.findByOrigin = async function(origin, organizationId, options = {}) {
  const query = {
    origin: origin.toLowerCase(),
    organizationId: new mongoose.Types.ObjectId(organizationId)
  };

  if (options.activeOnly !== false) {
    query.isActive = true;
  }

  let queryBuilder = this.findOne(query);

  if (options.populate) {
    queryBuilder = queryBuilder.populate(options.populate);
  }

  return await queryBuilder.exec();
};

/**
 * Finds all pattern-type origins for testing
 */
corsWhitelistSchema.statics.findPatternOrigins = async function(organizationId, tenantId = null, options = {}) {
  const query = {
    organizationId: new mongoose.Types.ObjectId(organizationId),
    type: 'pattern',
    isActive: true,
    'patternConfig.regex': { $exists: true, $ne: null }
  };

  if (tenantId) {
    query.$or = [
      { tenantId: new mongoose.Types.ObjectId(tenantId) },
      { tenantId: null }
    ];
  } else {
    query.tenantId = null;
  }

  if (options.environment) {
    query['ownership.environment'] = options.environment;
  }

  return await this.find(query).sort({ priority: -1, weight: -1 });
};

/**
 * Tests origin against all active patterns with comprehensive tracking
 */
corsWhitelistSchema.statics.testOriginAgainstPatterns = async function(origin, organizationId, tenantId = null, options = {}) {
  const patterns = await this.findPatternOrigins(organizationId, tenantId, options);
  
  for (const pattern of patterns) {
    try {
      if (pattern.testPattern(origin)) {
        // Update stats for matching pattern
        await pattern.updateStats(true, undefined, {
          matchedOrigin: origin,
          testTime: new Date()
        });
        
        logger.debug('Origin matched pattern', {
          origin,
          patternId: pattern._id,
          pattern: pattern.patternConfig.regex
        });
        
        return pattern;
      }
    } catch (error) {
      logger.error('Error testing pattern', {
        patternId: pattern._id,
        pattern: pattern.patternConfig.regex,
        origin,
        error: error.message
      });
    }
  }
  
  return null;
};

/**
 * Finds expired origins with cleanup options
 */
corsWhitelistSchema.statics.findExpiredOrigins = async function(organizationId, options = {}) {
  const query = {
    organizationId: new mongoose.Types.ObjectId(organizationId),
    expiryDate: { $lte: new Date() }
  };

  if (options.activeOnly !== false) {
    query.isActive = true;
  }

  if (options.environment) {
    query['ownership.environment'] = options.environment;
  }

  let queryBuilder = this.find(query);

  if (options.sort) {
    queryBuilder = queryBuilder.sort(options.sort);
  } else {
    queryBuilder = queryBuilder.sort({ expiryDate: 1 }); // Oldest first
  }

  return await queryBuilder.exec();
};

/**
 * Finds origins that need review
 */
corsWhitelistSchema.statics.findOriginsNeedingReview = async function(organizationId, options = {}) {
  const query = {
    organizationId: new mongoose.Types.ObjectId(organizationId),
    'compliance.nextReview': { $lte: new Date() },
    isActive: true
  };

  if (options.environment) {
    query['ownership.environment'] = options.environment;
  }

  if (options.riskLevel) {
    query['compliance.riskLevel'] = options.riskLevel;
  }

  return await this.find(query)
    .sort({ 'compliance.nextReview': 1, 'compliance.riskLevel': -1 })
    .limit(options.limit || 100);
};

/**
 * Gets comprehensive statistics for origins
 */
corsWhitelistSchema.statics.getOriginStats = async function(organizationId, options = {}) {
  const period = options.period || 'week';
  const periods = {
    'day': 1,
    'week': 7,
    'month': 30,
    'quarter': 90,
    'year': 365
  };

  const days = periods[period] || 7;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const pipeline = [
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(organizationId),
        'stats.lastUsed': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalOrigins: { $sum: 1 },
        activeOrigins: {
          $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
        },
        totalRequests: { $sum: '$stats.requestCount' },
        totalSuccesses: { $sum: '$stats.successCount' },
        totalFailures: { $sum: '$stats.failureCount' },
        averageResponseTime: { $avg: '$stats.averageResponseTime' },
        highRiskOrigins: {
          $sum: { 
            $cond: [
              { $in: ['$compliance.riskLevel', ['high', 'critical']] }, 
              1, 
              0
            ] 
          }
        },
        expiredOrigins: {
          $sum: {
            $cond: [
              { $and: [
                { $ne: ['$expiryDate', null] },
                { $lte: ['$expiryDate', new Date()] }
              ]},
              1,
              0
            ]
          }
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  const stats = result[0] || {
    totalOrigins: 0,
    activeOrigins: 0,
    totalRequests: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    averageResponseTime: 0,
    highRiskOrigins: 0,
    expiredOrigins: 0
  };

  // Calculate derived metrics
  stats.successRate = stats.totalRequests > 0 ? 
    (stats.totalSuccesses / stats.totalRequests) * 100 : 0;
  
  stats.failureRate = stats.totalRequests > 0 ?
    (stats.totalFailures / stats.totalRequests) * 100 : 0;

  stats.requestsPerDay = stats.totalRequests / days;

  return stats;
};

/**
 * Performs bulk import with comprehensive validation and error handling
 */
corsWhitelistSchema.statics.bulkImport = async function(origins, organizationId, importedBy, options = {}) {
  const results = {
    success: [],
    failed: [],
    duplicates: [],
    warnings: []
  };

  const batchSize = options.batchSize || 100;
  const batches = [];
  
  // Split origins into batches
  for (let i = 0; i < origins.length; i += batchSize) {
    batches.push(origins.slice(i, i + batchSize));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    logger.info('Processing batch', {
      batchIndex: batchIndex + 1,
      totalBatches: batches.length,
      batchSize: batch.length
    });

    for (const originData of batch) {
      try {
        // Validate required fields
        if (!originData.origin) {
          results.failed.push({
            origin: originData.origin || 'unknown',
            reason: 'Missing origin URL'
          });
          continue;
        }

        // Check for existing origin
        const existing = await this.findByOrigin(originData.origin, organizationId);
        if (existing) {
          if (options.updateExisting) {
            // Update existing origin
            Object.assign(existing, {
              ...originData,
              'metadata.source': 'import',
              'metadata.sourceDetails.importBatch': options.batchId || Date.now().toString()
            });
            await existing.save();
            
            results.success.push(existing);
          } else {
            results.duplicates.push({
              origin: originData.origin,
              reason: 'Origin already exists',
              existingId: existing._id
            });
          }
          continue;
        }

        // Create new origin
        const origin = await this.createOrigin({
          ...originData,
          organizationId,
          'ownership.createdBy': importedBy,
          'metadata.source': 'import',
          'metadata.sourceDetails': {
            importBatch: options.batchId || Date.now().toString(),
            importFile: options.fileName
          }
        });

        results.success.push(origin);

        // Add warning for high-risk origins
        if (['high', 'critical'].includes(origin.compliance.riskLevel)) {
          results.warnings.push({
            origin: origin.origin,
            warning: `High-risk origin (${origin.compliance.riskLevel}) imported`,
            id: origin._id
          });
        }

      } catch (error) {
        results.failed.push({
          origin: originData.origin || 'unknown',
          reason: error.message,
          code: error.code
        });
      }
    }
  }

  // Generate summary
  const summary = {
    total: origins.length,
    successful: results.success.length,
    failed: results.failed.length,
    duplicates: results.duplicates.length,
    warnings: results.warnings.length
  };

  logger.info('CORS origins bulk import completed', {
    organizationId,
    importedBy,
    summary,
    batchId: options.batchId
  });

  return {
    ...results,
    summary
  };
};

/**
 * Automated cleanup of expired origins
 */
corsWhitelistSchema.statics.cleanupExpired = async function(options = {}) {
  const dryRun = options.dryRun || false;
  const batchSize = options.batchSize || 100;
  
  const expiredOrigins = await this.find({
    expiryDate: { $lte: new Date() },
    isActive: true
  }).limit(batchSize);

  let processedCount = 0;
  let deactivatedCount = 0;
  let errorCount = 0;
  const errors = [];

  for (const origin of expiredOrigins) {
    try {
      if (!dryRun) {
        // Check if auto-renewal is possible
        if (origin.autoRenew.enabled && 
            origin.autoRenew.currentRenewals < origin.autoRenew.maxRenewals) {
          // Auto-renew instead of deactivating
          const intervals = {
            'monthly': 30,
            'quarterly': 90,
            'semi-annually': 180,
            'annually': 365
          };
          
          const days = intervals[origin.autoRenew.interval] || 90;
          const newExpiryDate = new Date(origin.expiryDate.getTime() + days * 24 * 60 * 60 * 1000);
          
          await origin.extend(null, newExpiryDate, 'Auto-renewed during cleanup', {
            resetAutoRenewal: false
          });
          
          logger.info('Origin auto-renewed during cleanup', {
            originId: origin._id,
            origin: origin.origin,
            newExpiryDate
          });
        } else {
          // Deactivate expired origin
          await origin.deactivate(null, 'Automatically deactivated due to expiry');
          deactivatedCount++;
        }
      }
      processedCount++;
    } catch (error) {
      errorCount++;
      errors.push({
        originId: origin._id,
        origin: origin.origin,
        error: error.message
      });
      
      logger.error('Failed to process expired origin', {
        whitelistId: origin._id,
        origin: origin.origin,
        error: error.message
      });
    }
  }

  const result = {
    processed: processedCount,
    deactivated: deactivatedCount,
    errors: errorCount,
    errorDetails: errors,
    dryRun
  };

  logger.info('Expired CORS origins cleanup completed', result);

  return result;
};

/**
 * Finds potential conflicts for a given origin
 */
corsWhitelistSchema.statics.findConflicts = async function(origin, organizationId, excludeId = null) {
  const query = {
    organizationId: new mongoose.Types.ObjectId(organizationId),
    isActive: true,
    $or: [
      { origin },
      { 
        type: 'wildcard',
        'wildcardConfig.baseDomain': { $exists: true }
      },
      {
        type: 'pattern',
        'patternConfig.regex': { $exists: true }
      }
    ]
  };

  if (excludeId) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
  }

  const potentialConflicts = await this.find(query);
  const conflicts = [];

  for (const potential of potentialConflicts) {
    if (potential.origin === origin) {
      conflicts.push({
        type: 'exact_match',
        conflictingOrigin: potential,
        reason: 'Exact origin match'
      });
    } else if (potential.type === 'pattern') {
      try {
        if (potential.testPattern(origin)) {
          conflicts.push({
            type: 'pattern_match',
            conflictingOrigin: potential,
            reason: 'Origin matches existing pattern'
          });
        }
      } catch (error) {
        // Pattern test failed, log but don't block
        logger.warn('Pattern test failed during conflict detection', {
          patternId: potential._id,
          origin,
          error: error.message
        });
      }
    }
    // Add more conflict detection logic for wildcards, subdomains, etc.
  }

  return conflicts;
};

/**
 * Triggers webhook for origin events
 */
corsWhitelistSchema.statics.triggerWebhook = async function(webhook, origin, event) {
  try {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      origin: {
        id: origin._id,
        origin: origin.origin,
        type: origin.type,
        environment: origin.ownership.environment,
        riskLevel: origin.compliance.riskLevel
      }
    };

    // Generate webhook signature if secret is provided
    let signature = null;
    if (webhook.secret) {
      const crypto = require('crypto');
      signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    }

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CORS-Whitelist-Service/1.0',
        ...(signature && { 'X-Webhook-Signature': `sha256=${signature}` })
      },
      body: JSON.stringify(payload),
      timeout: webhook.timeout
    });

    webhook.statistics.successCount += 1;
    webhook.lastTriggered = new Date();

    logger.info('Webhook triggered successfully', {
      webhookUrl: webhook.url,
      event,
      originId: origin._id,
      responseStatus: response.status
    });

  } catch (error) {
    webhook.statistics.failureCount += 1;
    
    logger.error('Webhook trigger failed', {
      webhookUrl: webhook.url,
      event,
      originId: origin._id,
      error: error.message
    });

    throw error;
  }
};

/**
 * Gets security team email addresses for notifications
 */
corsWhitelistSchema.statics.getSecurityTeamEmails = async function(organizationId) {
  try {
    const User = mongoose.model('User');
    const securityUsers = await User.find({
      organizationId,
      'roles': { $in: ['security_admin', 'security_manager', 'ciso'] },
      isActive: true
    }).select('email');

    return securityUsers.map(user => user.email).filter(Boolean);
  } catch (error) {
    logger.error('Failed to get security team emails', {
      organizationId,
      error: error.message
    });
    return [];
  }
};

// Create and export model with enhanced error handling
let CorsWhitelistModel;

try {
  CorsWhitelistModel = BaseModel.createModel('CorsWhitelist', corsWhitelistSchema);
} catch (error) {
  logger.error('Failed to create CorsWhitelist model', {
    error: error.message,
    stack: error.stack
  });
  throw new AppError('Model creation failed', 500, 'MODEL_CREATION_ERROR');
}

module.exports = CorsWhitelistModel;