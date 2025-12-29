/**
 * @fileoverview Admin Audit Log Model
 * @module shared/lib/database/models/admin-server/admin-audit-log
 * @description Comprehensive audit logging for all administrative actions with tamper-proof design.
 *              Tracks who did what, when, where, and the outcome for compliance and security.
 * @version 1.0.0
 * @requires mongoose
 */

'use strict';

const mongoose = require('mongoose');

/**
 * Admin Audit Log Schema
 * @typedef {Object} AdminAuditLogSchema
 * @description Immutable audit trail for administrative actions
 */
const adminAuditLogSchema = new mongoose.Schema(
  {
    // ============================================================================
    // Actor Information (Who)
    // ============================================================================

    /**
     * @property {mongoose.Schema.Types.ObjectId} actor - Admin user who performed the action
     * @required
     * @index
     */
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: [true, 'Actor is required'],
      index: true,
      immutable: true
    },

    /**
     * @property {Object} actorSnapshot - Snapshot of actor at time of action
     * @description Preserves actor info even if account is deleted
     */
    actorSnapshot: {
      email: String,
      fullName: String,
      role: String,
      department: String
    },

    /**
     * @property {string} actorType - Type of actor
     * @enum {string} - admin_user, api_key, system
     */
    actorType: {
      type: String,
      enum: ['admin_user', 'api_key', 'system'],
      default: 'admin_user',
      required: true,
      immutable: true
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} apiKey - API key used (if applicable)
     */
    apiKey: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminAPIKey',
      immutable: true
    },

    // ============================================================================
    // Action Information (What)
    // ============================================================================

    /**
     * @property {string} action - Action performed
     * @required
     * @index
     * @example 'user.create', 'user.update', 'user.delete', 'session.revoke'
     */
    action: {
      type: String,
      required: [true, 'Action is required'],
      index: true,
      immutable: true
    },

    /**
     * @property {string} category - Action category for grouping
     * @enum {string}
     */
    category: {
      type: String,
      enum: [
        'authentication',
        'authorization',
        'user_management',
        'role_management',
        'permission_management',
        'api_key_management',
        'session_management',
        'system_configuration',
        'billing',
        'audit',
        'security',
        'data_export',
        'data_import',
        'integration',
        'other'
      ],
      required: true,
      index: true,
      immutable: true
    },

    /**
     * @property {string} severity - Action severity level
     * @enum {string}
     */
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
      immutable: true
    },

    /**
     * @property {string} description - Human-readable description
     * @required
     */
    description: {
      type: String,
      required: [true, 'Description is required'],
      immutable: true
    },

    // ============================================================================
    // Target Information (On What)
    // ============================================================================

    /**
     * @property {string} resourceType - Type of resource affected
     * @example 'AdminUser', 'AdminRole', 'AdminAPIKey'
     */
    resourceType: {
      type: String,
      index: true,
      immutable: true
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} resourceId - ID of affected resource
     */
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      immutable: true
    },

    /**
     * @property {Object} resourceSnapshot - Snapshot of resource before action
     */
    resourceSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      immutable: true
    },

    /**
     * @property {Object} changes - Changes made to resource
     * @description Before/after values for updates
     */
    changes: {
      before: {
        type: mongoose.Schema.Types.Mixed,
        immutable: true
      },
      after: {
        type: mongoose.Schema.Types.Mixed,
        immutable: true
      },
      fields: {
        type: [String],
        immutable: true
      }
    },

    // ============================================================================
    // Context Information (When & Where)
    // ============================================================================

    /**
     * @property {Date} timestamp - When action occurred
     * @required
     * @index
     */
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
      immutable: true
    },

    /**
     * @property {string} ipAddress - IP address of actor
     * @required
     * @index
     */
    ipAddress: {
      type: String,
      required: [true, 'IP address is required'],
      index: true,
      immutable: true
    },

    /**
     * @property {string} userAgent - User agent string
     */
    userAgent: {
      type: String,
      immutable: true
    },

    /**
     * @property {Object} location - Geographic location
     */
    location: {
      country: String,
      city: String,
      timezone: String
    },

    /**
     * @property {string} sessionId - Session ID if applicable
     */
    sessionId: {
      type: String,
      index: true,
      immutable: true
    },

    // ============================================================================
    // Result Information
    // ============================================================================

    /**
     * @property {string} status - Action status
     * @enum {string}
     */
    status: {
      type: String,
      enum: ['success', 'failure', 'partial', 'pending'],
      default: 'success',
      required: true,
      index: true,
      immutable: true
    },

    /**
     * @property {string} errorMessage - Error message if failed
     */
    errorMessage: {
      type: String,
      immutable: true
    },

    /**
     * @property {Object} errorDetails - Detailed error information
     */
    errorDetails: {
      type: mongoose.Schema.Types.Mixed,
      immutable: true
    },

    /**
     * @property {number} duration - Action duration in milliseconds
     */
    duration: {
      type: Number,
      min: 0,
      immutable: true
    },

    // ============================================================================
    // Request/Response Information
    // ============================================================================

    /**
     * @property {Object} request - HTTP request details
     */
    request: {
      method: String,
      url: String,
      endpoint: String,
      headers: mongoose.Schema.Types.Mixed,
      query: mongoose.Schema.Types.Mixed,
      body: mongoose.Schema.Types.Mixed
    },

    /**
     * @property {Object} response - HTTP response details
     */
    response: {
      statusCode: Number,
      body: mongoose.Schema.Types.Mixed
    },

    // ============================================================================
    // Security & Compliance
    // ============================================================================

    /**
     * @property {boolean} isSuspicious - Flag for suspicious activity
     * @index
     */
    isSuspicious: {
      type: Boolean,
      default: false,
      index: true,
      immutable: true
    },

    /**
     * @property {Array<string>} suspiciousReasons - Reasons for suspicious flag
     */
    suspiciousReasons: {
      type: [String],
      default: [],
      immutable: true
    },

    /**
     * @property {Array<string>} complianceTags - Tags for compliance reporting
     * @example ['GDPR', 'HIPAA', 'SOC2', 'PCI-DSS']
     */
    complianceTags: {
      type: [String],
      default: [],
      index: true,
      immutable: true
    },

    /**
     * @property {boolean} requiresReview - Flag for manual review
     */
    requiresReview: {
      type: Boolean,
      default: false,
      index: true
    },

    /**
     * @property {Date} reviewedAt - When log was reviewed
     */
    reviewedAt: Date,

    /**
     * @property {mongoose.Schema.Types.ObjectId} reviewedBy - Admin who reviewed
     */
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },

    /**
     * @property {string} reviewNotes - Review notes
     */
    reviewNotes: String,

    // ============================================================================
    // Metadata
    // ============================================================================

    /**
     * @property {Object} metadata - Additional flexible metadata
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      immutable: true
    },

    /**
     * @property {string} correlationId - ID for correlating related actions
     */
    correlationId: {
      type: String,
      index: true,
      immutable: true
    },

    /**
     * @property {string} traceId - Distributed tracing ID
     */
    traceId: {
      type: String,
      immutable: true
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable, only createdAt
    collection: 'admin_audit_logs',
    toJSON: {
      transform: function(doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// ============================================================================
// Indexes for Query Performance
// ============================================================================

adminAuditLogSchema.index({ actor: 1, timestamp: -1 });
adminAuditLogSchema.index({ action: 1, timestamp: -1 });
adminAuditLogSchema.index({ category: 1, timestamp: -1 });
adminAuditLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });
adminAuditLogSchema.index({ status: 1, timestamp: -1 });
adminAuditLogSchema.index({ isSuspicious: 1, timestamp: -1 });
adminAuditLogSchema.index({ sessionId: 1, timestamp: -1 });
adminAuditLogSchema.index({ correlationId: 1 });
adminAuditLogSchema.index({ complianceTags: 1, timestamp: -1 });

// TTL index for automatic cleanup (optional - keep for compliance period)
// adminAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 365 * 24 * 60 * 60 }); // 7 years

// ============================================================================
// Static Methods
// ============================================================================

/**
 * Log an action
 * @param {Object} logData - Audit log data
 * @returns {Promise<Object>} Created log document
 * @static
 */
adminAuditLogSchema.statics.logAction = async function(logData) {
  return this.create(logData);
};

/**
 * Find logs by actor
 * @param {mongoose.Schema.Types.ObjectId} actorId - Actor ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Audit logs
 * @static
 */
adminAuditLogSchema.statics.findByActor = function(actorId, options = {}) {
  const { limit = 100, skip = 0, startDate, endDate } = options;

  const query = { actor: actorId };
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);
};

/**
 * Find logs by resource
 * @param {string} resourceType - Resource type
 * @param {mongoose.Schema.Types.ObjectId} resourceId - Resource ID
 * @returns {Promise<Array>} Audit logs
 * @static
 */
adminAuditLogSchema.statics.findByResource = function(resourceType, resourceId) {
  return this.find({ resourceType, resourceId })
    .sort({ timestamp: -1 })
    .populate('actor', 'email fullName role');
};

/**
 * Find suspicious activities
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Suspicious audit logs
 * @static
 */
adminAuditLogSchema.statics.findSuspicious = function(options = {}) {
  const { limit = 100, unreviewed = false } = options;

  const query = { isSuspicious: true };
  if (unreviewed) {
    query.reviewedAt = null;
  }

  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('actor', 'email fullName role');
};

/**
 * Generate audit report
 * @param {Object} filters - Report filters
 * @returns {Promise<Object>} Audit statistics
 * @static
 */
adminAuditLogSchema.statics.generateReport = async function(filters = {}) {
  const { startDate, endDate, actorId, category, status } = filters;

  const matchStage = {};
  if (startDate || endDate) {
    matchStage.timestamp = {};
    if (startDate) matchStage.timestamp.$gte = new Date(startDate);
    if (endDate) matchStage.timestamp.$lte = new Date(endDate);
  }
  if (actorId) matchStage.actor = actorId;
  if (category) matchStage.category = category;
  if (status) matchStage.status = status;

  const [stats] = await this.aggregate([
    { $match: matchStage },
    {
      $facet: {
        total: [{ $count: 'count' }],
        byCategory: [
          { $group: { _id: '$category', count: { $sum: 1 } } }
        ],
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],
        bySeverity: [
          { $group: { _id: '$severity', count: { $sum: 1 } } }
        ],
        suspicious: [
          { $match: { isSuspicious: true } },
          { $count: 'count' }
        ]
      }
    }
  ]);

  return {
    total: stats.total[0]?.count || 0,
    byCategory: stats.byCategory.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {}),
    byStatus: stats.byStatus.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {}),
    bySeverity: stats.bySeverity.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {}),
    suspicious: stats.suspicious[0]?.count || 0
  };
};

// ============================================================================
// Model Export - ConnectionManager Compatible
// ============================================================================

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: adminAuditLogSchema,
  modelName: 'AdminAuditLog'
};
