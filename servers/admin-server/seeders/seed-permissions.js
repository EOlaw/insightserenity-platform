/**
 * @fileoverview Seed Permissions
 * @module servers/admin-server/seeders/seed-permissions
 * @description Seeds all available permissions for the admin system
 * @version 1.0.0
 */

'use strict';

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'seed-permissions' });

// Import model dynamically to avoid buffering timeout issues
let AdminPermission;

/**
 * Permission definitions
 * Format: resource:action
 */
const PERMISSIONS = [
  // User management
  { name: 'users:read', description: 'View admin users', resource: 'users', action: 'read' },
  { name: 'users:create', description: 'Create new admin users', resource: 'users', action: 'create' },
  { name: 'users:update', description: 'Update admin users', resource: 'users', action: 'update' },
  { name: 'users:delete', description: 'Delete admin users', resource: 'users', action: 'delete' },

  // Role management
  { name: 'roles:read', description: 'View roles', resource: 'roles', action: 'read' },
  { name: 'roles:create', description: 'Create new roles', resource: 'roles', action: 'create' },
  { name: 'roles:update', description: 'Update roles', resource: 'roles', action: 'update' },
  { name: 'roles:delete', description: 'Delete roles', resource: 'roles', action: 'delete' },

  // Permission management
  { name: 'permissions:read', description: 'View permissions', resource: 'permissions', action: 'read' },
  { name: 'permissions:create', description: 'Create new permissions', resource: 'permissions', action: 'create' },
  { name: 'permissions:update', description: 'Update permissions', resource: 'permissions', action: 'update' },
  { name: 'permissions:delete', description: 'Delete permissions', resource: 'permissions', action: 'delete' },

  // Session management
  { name: 'sessions:read', description: 'View sessions', resource: 'sessions', action: 'read' },
  { name: 'sessions:update', description: 'Update sessions', resource: 'sessions', action: 'update' },
  { name: 'sessions:delete', description: 'Revoke sessions', resource: 'sessions', action: 'delete' },

  // Invitation management
  { name: 'invitations:read', description: 'View invitations', resource: 'invitations', action: 'read' },
  { name: 'invitations:create', description: 'Send invitations', resource: 'invitations', action: 'create' },
  { name: 'invitations:delete', description: 'Revoke invitations', resource: 'invitations', action: 'delete' },

  // API key management
  { name: 'api_keys:read', description: 'View API keys', resource: 'api_keys', action: 'read' },
  { name: 'api_keys:create', description: 'Create API keys', resource: 'api_keys', action: 'create' },
  { name: 'api_keys:update', description: 'Update API keys', resource: 'api_keys', action: 'update' },
  { name: 'api_keys:delete', description: 'Delete API keys', resource: 'api_keys', action: 'delete' },

  // Audit log management
  { name: 'audit:read', description: 'View audit logs', resource: 'audit', action: 'read' },
  { name: 'audit:export', description: 'Export audit logs', resource: 'audit', action: 'export' },

  // System settings
  { name: 'settings:read', description: 'View system settings', resource: 'settings', action: 'read' },
  { name: 'settings:update', description: 'Update system settings', resource: 'settings', action: 'update' },

  // Customer management (from customer-services)
  { name: 'customers:read', description: 'View customers', resource: 'customers', action: 'read' },
  { name: 'customers:update', description: 'Update customers', resource: 'customers', action: 'update' },
  { name: 'customers:delete', description: 'Delete customers', resource: 'customers', action: 'delete' },

  // Consultation management
  { name: 'consultations:read', description: 'View consultations', resource: 'consultations', action: 'read' },
  { name: 'consultations:update', description: 'Update consultations', resource: 'consultations', action: 'update' },
  { name: 'consultations:cancel', description: 'Cancel consultations', resource: 'consultations', action: 'cancel' },

  // Billing management
  { name: 'billing:read', description: 'View billing information', resource: 'billing', action: 'read' },
  { name: 'billing:update', description: 'Update billing information', resource: 'billing', action: 'update' },
  { name: 'billing:refund', description: 'Process refunds', resource: 'billing', action: 'refund' },

  // Report generation
  { name: 'reports:read', description: 'View reports', resource: 'reports', action: 'read' },
  { name: 'reports:generate', description: 'Generate reports', resource: 'reports', action: 'generate' },
  { name: 'reports:export', description: 'Export reports', resource: 'reports', action: 'export' },

  // Security management
  { name: 'security:read', description: 'View security events', resource: 'security', action: 'read' },
  { name: 'security:manage', description: 'Manage security settings', resource: 'security', action: 'manage' }
];

/**
 * Seed permissions
 * @returns {Promise<Object>} Seeding result
 */
async function seedPermissions() {
  try {
    logger.info('Starting permission seeding');

    // Check if permissions already exist
    const existingCount = await AdminPermission.countDocuments();

    if (existingCount > 0) {
      logger.info('Permissions already seeded', { count: existingCount });
      return {
        success: true,
        message: 'Permissions already exist',
        count: existingCount
      };
    }

    // Create permissions - ensure permission field is set
    const permissions = PERMISSIONS.map(p => ({
      resource: p.resource,
      action: p.action,
      permission: `${p.resource}:${p.action}`, // Manually set permission field
      name: p.name,
      description: p.description,
      isActive: true,
      isSystem: true // Mark as system permission (cannot be deleted)
    }));

    const result = await AdminPermission.insertMany(permissions);

    logger.info('Permissions seeded successfully', { count: result.length });

    return {
      success: true,
      message: `${result.length} permissions seeded successfully`,
      count: result.length
    };
  } catch (error) {
    logger.error('Permission seeding failed', {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: error.message
    };
  }
}

// Export for use in scripts
module.exports = seedPermissions;

// Allow running directly
if (require.main === module) {
  const mongoose = require('mongoose');

  (async () => {
    try {
      // Connect to database FIRST
      const dbUri = process.env.DATABASE_ADMIN_URI || 'mongodb://localhost:27017/insightserenity_admin_dev';

      logger.info('Connecting to database...', { database: dbUri.split('/').pop().split('?')[0] });

      await mongoose.connect(dbUri, {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000
      });

      // Wait for connection to be fully ready
      if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => {
          mongoose.connection.once('connected', resolve);
        });
      }

      logger.info('Database connected successfully', { database: dbUri.split('/').pop().split('?')[0] });

      // Create the schema directly using the current mongoose connection
      const adminPermissionSchema = new mongoose.Schema(
        {
          resource: {
            type: String,
            required: [true, 'Resource is required'],
            lowercase: true,
            trim: true,
            index: true
          },
          action: {
            type: String,
            required: [true, 'Action is required'],
            lowercase: true,
            trim: true,
            index: true
          },
          permission: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            match: [/^[a-z_-]+:[a-z_-]+$/i, 'Invalid permission format'],
            index: true
          },
          name: {
            type: String,
            required: [true, 'Permission name is required'],
            trim: true
          },
          description: {
            type: String,
            trim: true,
            maxlength: [500, 'Description cannot exceed 500 characters']
          },
          isActive: {
            type: Boolean,
            default: true,
            index: true
          },
          isSystem: {
            type: Boolean,
            default: false
          }
        },
        {
          timestamps: true,
          collection: 'admin_permissions'
        }
      );

      // Add pre-save middleware to auto-generate permission field
      adminPermissionSchema.pre('save', function(next) {
        // Auto-generate permission string from resource and action
        if (this.isModified('resource') || this.isModified('action')) {
          this.permission = `${this.resource}:${this.action}`;
        }
        next();
      });

      // Register model with current connection
      AdminPermission = mongoose.model('AdminPermission', adminPermissionSchema);

      logger.info('Model registered with current connection', {
        modelName: AdminPermission.modelName,
        connectionReady: mongoose.connection.readyState
      });

      // Run seeder
      const result = await seedPermissions();
      console.log(JSON.stringify(result, null, 2));

      // Disconnect
      await mongoose.disconnect();
      logger.info('Database disconnected');

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    }
  })();
}
