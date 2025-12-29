/**
 * @fileoverview Seed Roles
 * @module servers/admin-server/seeders/seed-roles
 * @description Seeds default roles for the admin system
 * @version 1.0.0
 */

'use strict';

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'seed-roles' });

// Import models dynamically to avoid buffering timeout issues
let AdminRole;
let AdminPermission;

/**
 * Seed roles
 * @returns {Promise<Object>} Seeding result
 */
async function seedRoles() {
  try {
    logger.info('Starting role seeding');

    // Check if roles already exist
    const existingCount = await AdminRole.countDocuments();

    if (existingCount > 0) {
      logger.info('Roles already seeded', { count: existingCount });
      return {
        success: true,
        message: 'Roles already exist',
        count: existingCount
      };
    }

    // Get all permissions
    const allPermissions = await AdminPermission.find({ isActive: true }).select('_id name');

    if (allPermissions.length === 0) {
      throw new Error('No permissions found. Please run seed-permissions first.');
    }

    // Define roles with their permissions
    const roles = [
      {
        name: 'super_admin',
        description: 'Super Administrator with full system access',
        level: 100,
        permissions: allPermissions.map(p => p._id), // All permissions
        isSystem: true,
        isActive: true
      },
      {
        name: 'admin',
        description: 'Administrator with most permissions',
        level: 80,
        permissions: allPermissions
          .filter(p => !p.name.startsWith('settings:') && !p.name.startsWith('security:manage'))
          .map(p => p._id),
        isSystem: true,
        isActive: true
      },
      {
        name: 'moderator',
        description: 'Moderator with limited administrative access',
        level: 50,
        permissions: allPermissions
          .filter(p =>
            p.name.includes(':read') ||
            p.name === 'users:update' ||
            p.name === 'sessions:read' ||
            p.name === 'consultations:update' ||
            p.name === 'consultations:cancel'
          )
          .map(p => p._id),
        isSystem: true,
        isActive: true
      },
      {
        name: 'support',
        description: 'Customer support with read access and limited update permissions',
        level: 30,
        permissions: allPermissions
          .filter(p =>
            p.name.includes(':read') ||
            p.name === 'customers:update' ||
            p.name === 'consultations:update'
          )
          .map(p => p._id),
        isSystem: true,
        isActive: true
      },
      {
        name: 'viewer',
        description: 'Read-only access to most resources',
        level: 10,
        permissions: allPermissions
          .filter(p => p.name.includes(':read'))
          .map(p => p._id),
        isSystem: true,
        isActive: true
      },
      {
        name: 'billing_admin',
        description: 'Billing administrator with billing-related permissions',
        level: 40,
        permissions: allPermissions
          .filter(p =>
            p.name.includes('billing:') ||
            p.name.includes('customers:read') ||
            p.name.includes('reports:')
          )
          .map(p => p._id),
        isSystem: true,
        isActive: true
      }
    ];

    // Create roles
    const result = await AdminRole.insertMany(roles);

    logger.info('Roles seeded successfully', { count: result.length });

    return {
      success: true,
      message: `${result.length} roles seeded successfully`,
      count: result.length,
      roles: result.map(r => ({ name: r.name, permissionCount: r.permissions.length }))
    };
  } catch (error) {
    logger.error('Role seeding failed', {
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
module.exports = seedRoles;

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

      // Create AdminPermission schema
      const adminPermissionSchema = new mongoose.Schema(
        {
          resource: { type: String, required: true, lowercase: true, trim: true, index: true },
          action: { type: String, required: true, lowercase: true, trim: true, index: true },
          permission: { type: String, required: true, unique: true, trim: true, index: true },
          name: { type: String, required: true, trim: true },
          description: { type: String, trim: true },
          isActive: { type: Boolean, default: true, index: true },
          isSystem: { type: Boolean, default: false }
        },
        { timestamps: true, collection: 'admin_permissions' }
      );

      // Create AdminRole schema
      const adminRoleSchema = new mongoose.Schema(
        {
          name: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
          displayName: { type: String, trim: true },
          description: { type: String, trim: true },
          level: { type: Number, required: true, min: 0, max: 100, index: true },
          permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdminPermission' }],
          isSystem: { type: Boolean, default: false },
          isActive: { type: Boolean, default: true, index: true }
        },
        { timestamps: true, collection: 'admin_roles' }
      );

      // Register models with current connection
      AdminPermission = mongoose.model('AdminPermission', adminPermissionSchema);
      AdminRole = mongoose.model('AdminRole', adminRoleSchema);

      logger.info('Models registered with current connection', {
        connectionReady: mongoose.connection.readyState
      });

      // Run seeder
      const result = await seedRoles();
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
