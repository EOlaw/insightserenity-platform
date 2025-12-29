/**
 * @fileoverview Admin Role Model
 * @module shared/lib/database/models/admin-server/admin-role
 * @description Mongoose model for Role-Based Access Control (RBAC) in admin system.
 *              Defines roles with hierarchical permissions and inheritance.
 * @version 1.0.0
 * @requires mongoose
 */

'use strict';

const mongoose = require('mongoose');

/**
 * Admin Role Schema
 * @typedef {Object} AdminRoleSchema
 */
const adminRoleSchema = new mongoose.Schema(
  {
    /**
     * @property {string} name - Role name
     * @required
     * @unique
     */
    name: {
      type: String,
      required: [true, 'Role name is required'],
      unique: true,
      trim: true,
      minlength: [2, 'Role name must be at least 2 characters'],
      maxlength: [50, 'Role name cannot exceed 50 characters'],
      index: true
    },

    /**
     * @property {string} slug - URL-friendly slug
     * @required
     * @unique
     */
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens']
    },

    /**
     * @property {string} description - Role description
     */
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },

    /**
     * @property {number} level - Hierarchical level (higher = more permissions)
     * @description Used for role inheritance and comparison
     */
    level: {
      type: Number,
      required: true,
      min: [0, 'Level cannot be negative'],
      max: [100, 'Level cannot exceed 100'],
      index: true
    },

    /**
     * @property {Array<string>} permissions - Direct permission assignments
     * @example ['users:read', 'users:write', 'billing:admin']
     */
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: function(perms) {
          return perms.every(perm => /^[a-z-]+:[a-z-]+$/i.test(perm));
        },
        message: 'Invalid permission format. Use resource:action'
      }
    },

    /**
     * @property {Array<mongoose.Schema.Types.ObjectId>} inheritsFrom - Parent roles
     * @description Roles inherit permissions from parent roles
     */
    inheritsFrom: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminRole'
    }],

    /**
     * @property {boolean} isSystemRole - Whether this is a system-defined role
     * @description System roles cannot be deleted
     */
    isSystemRole: {
      type: Boolean,
      default: false,
      index: true
    },

    /**
     * @property {boolean} isActive - Whether role is active
     */
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} createdBy - Admin who created the role
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} lastModifiedBy - Admin who last modified
     */
    lastModifiedBy: {
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
    collection: 'admin_roles'
  }
);

// ============================================================================
// Indexes
// ============================================================================

adminRoleSchema.index({ name: 1, isActive: 1 });
adminRoleSchema.index({ slug: 1 });
adminRoleSchema.index({ level: -1 });

// ============================================================================
// Instance Methods
// ============================================================================

/**
 * Get all permissions including inherited
 * @returns {Promise<Array<string>>} All permissions
 * @async
 */
adminRoleSchema.methods.getAllPermissions = async function() {
  const permissions = new Set(this.permissions);

  // Get inherited permissions
  if (this.inheritsFrom && this.inheritsFrom.length > 0) {
    const parentRoles = await this.constructor
      .find({ _id: { $in: this.inheritsFrom }, isActive: true })
      .populate('inheritsFrom');

    for (const parent of parentRoles) {
      const parentPerms = await parent.getAllPermissions();
      parentPerms.forEach(perm => permissions.add(perm));
    }
  }

  return Array.from(permissions);
};

/**
 * Check if role has specific permission
 * @param {string} permission - Permission to check
 * @returns {Promise<boolean>} True if has permission
 * @async
 */
adminRoleSchema.methods.hasPermission = async function(permission) {
  const allPermissions = await this.getAllPermissions();
  return allPermissions.includes(permission);
};

// ============================================================================
// Static Methods
// ============================================================================

adminRoleSchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug, isActive: true });
};

adminRoleSchema.statics.getSystemRoles = function() {
  return this.find({ isSystemRole: true, isActive: true }).sort({ level: -1 });
};

// ============================================================================
// Model Export - ConnectionManager Compatible
// ============================================================================

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: adminRoleSchema,
  modelName: 'AdminRole'
};
