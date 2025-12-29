/**
 * @fileoverview Admin Permission Model
 * @module shared/lib/database/models/admin-server/admin-permission
 * @description Mongoose model for granular permission definitions in admin system.
 * @version 1.0.0
 * @requires mongoose
 */

'use strict';

const mongoose = require('mongoose');

/**
 * Admin Permission Schema
 * @typedef {Object} AdminPermissionSchema
 */
const adminPermissionSchema = new mongoose.Schema(
  {
    /**
     * @property {string} resource - Resource name
     * @required
     * @example 'users', 'billing', 'analytics'
     */
    resource: {
      type: String,
      required: [true, 'Resource is required'],
      lowercase: true,
      trim: true,
      index: true
    },

    /**
     * @property {string} action - Action on resource
     * @required
     * @example 'read', 'write', 'delete', 'admin'
     */
    action: {
      type: String,
      required: [true, 'Action is required'],
      lowercase: true,
      trim: true,
      index: true
    },

    /**
     * @property {string} permission - Full permission string
     * @required
     * @unique
     * @example 'users:read', 'billing:admin'
     */
    permission: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[a-z-]+:[a-z-]+$/i, 'Invalid permission format'],
      index: true
    },

    /**
     * @property {string} name - Human-readable permission name
     * @required
     */
    name: {
      type: String,
      required: [true, 'Permission name is required'],
      trim: true
    },

    /**
     * @property {string} description - Permission description
     */
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },

    /**
     * @property {string} category - Permission category
     */
    category: {
      type: String,
      enum: [
        'user_management',
        'role_management',
        'billing',
        'analytics',
        'system_configuration',
        'security',
        'audit',
        'content_management',
        'other'
      ],
      default: 'other',
      index: true
    },

    /**
     * @property {boolean} isSystemPermission - System-defined permission
     */
    isSystemPermission: {
      type: Boolean,
      default: false
    },

    /**
     * @property {boolean} isActive - Whether permission is active
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} createdBy - Creator
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },

    /**
     * @property {Object} metadata - Additional metadata
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    collection: 'admin_permissions'
  }
);

// ============================================================================
// Indexes
// ============================================================================

adminPermissionSchema.index({ resource: 1, action: 1 });
adminPermissionSchema.index({ category: 1, isActive: 1 });

// ============================================================================
// Pre-Save Middleware
// ============================================================================

adminPermissionSchema.pre('save', function(next) {
  // Auto-generate permission string from resource and action
  if (this.isModified('resource') || this.isModified('action')) {
    this.permission = `${this.resource}:${this.action}`;
  }
  next();
});

// ============================================================================
// Static Methods
// ============================================================================

adminPermissionSchema.statics.findByResource = function(resource) {
  return this.find({ resource, isActive: true }).sort({ action: 1 });
};

adminPermissionSchema.statics.findByCategory = function(category) {
  return this.find({ category, isActive: true }).sort({ resource: 1, action: 1 });
};

adminPermissionSchema.statics.findByPermission = function(permission) {
  return this.findOne({ permission, isActive: true });
};

// ============================================================================
// Model Export - ConnectionManager Compatible
// ============================================================================

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: adminPermissionSchema,
  modelName: 'AdminPermission'
};
