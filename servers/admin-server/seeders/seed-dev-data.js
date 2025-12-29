/**
 * @fileoverview Seed Development Data
 * @module servers/admin-server/seeders/seed-dev-data
 * @description Seeds development/testing data (only for development environment)
 * @version 1.0.0
 */

'use strict';

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'seed-dev-data' });

// Import models dynamically to avoid buffering timeout issues
let AdminUser;
let AdminRole;

/**
 * Seed development data
 * @returns {Promise<Object>} Seeding result
 */
async function seedDevData() {
  try {
    // Only run in development
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Cannot seed dev data in production environment');
      return {
        success: false,
        error: 'Dev data seeding is disabled in production'
      };
    }

    logger.info('Starting development data seeding');

    // Check if dev data already exists
    const existingDevUsers = await AdminUser.countDocuments({
      email: { $regex: /@devtest\.com$/ }
    });

    if (existingDevUsers > 0) {
      logger.info('Development data already seeded', { count: existingDevUsers });
      return {
        success: true,
        message: 'Development data already exists',
        count: existingDevUsers
      };
    }

    // Get roles
    const roles = await AdminRole.find({ name: { $in: ['admin', 'moderator', 'support', 'viewer', 'billing_admin'] } });

    if (roles.length === 0) {
      throw new Error('Roles not found. Please run seed-roles first.');
    }

    // Default password for all dev users
    const defaultPassword = 'DevPassword123!';
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    // Create dev users for each role
    const devUsers = [
      {
        email: 'admin@devtest.com',
        firstName: 'Admin',
        lastName: 'Developer',
        role: 'admin',
        department: 'development',
        passwordHash,
        isActive: true,
        isEmailVerified: true,
        mfaEnabled: false
      },
      {
        email: 'moderator@devtest.com',
        firstName: 'Moderator',
        lastName: 'Developer',
        role: 'moderator',
        department: 'moderation',
        passwordHash,
        isActive: true,
        isEmailVerified: true,
        mfaEnabled: false
      },
      {
        email: 'support@devtest.com',
        firstName: 'Support',
        lastName: 'Agent',
        role: 'support',
        department: 'customer_support',
        passwordHash,
        isActive: true,
        isEmailVerified: true,
        mfaEnabled: false
      },
      {
        email: 'viewer@devtest.com',
        firstName: 'Read',
        lastName: 'Only',
        role: 'viewer',
        department: 'reporting',
        passwordHash,
        isActive: true,
        isEmailVerified: true,
        mfaEnabled: false
      },
      {
        email: 'billing@devtest.com',
        firstName: 'Billing',
        lastName: 'Admin',
        role: 'billing_admin',
        department: 'finance',
        passwordHash,
        isActive: true,
        isEmailVerified: true,
        mfaEnabled: false
      },
      {
        email: 'test.mfa@devtest.com',
        firstName: 'MFA',
        lastName: 'Tester',
        role: 'admin',
        department: 'development',
        passwordHash,
        isActive: true,
        isEmailVerified: true,
        mfaEnabled: true, // For testing MFA flow
        mfaSecret: 'JBSWY3DPEHPK3PXP' // Test TOTP secret
      },
      {
        email: 'inactive@devtest.com',
        firstName: 'Inactive',
        lastName: 'User',
        role: 'viewer',
        department: 'testing',
        passwordHash,
        isActive: false,
        isEmailVerified: true,
        mfaEnabled: false
      }
    ];

    // Add permissions from roles
    for (const user of devUsers) {
      const role = roles.find(r => r.name === user.role);
      if (role) {
        user.permissions = role.permissions;
      }
    }

    // Create dev users
    const result = await AdminUser.insertMany(devUsers);

    logger.info('Development data seeded successfully', { count: result.length });

    return {
      success: true,
      message: `${result.length} development users created`,
      count: result.length,
      users: result.map(u => ({
        email: u.email,
        role: u.role,
        isActive: u.isActive
      })),
      credentials: {
        password: defaultPassword,
        note: 'All dev users use the same password'
      }
    };
  } catch (error) {
    logger.error('Development data seeding failed', {
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
module.exports = seedDevData;

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

      // Create AdminUser schema
      const adminUserSchema = new mongoose.Schema(
        {
          email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
          firstName: { type: String, required: true, trim: true },
          lastName: { type: String, required: true, trim: true },
          passwordHash: { type: String, required: true },
          role: { type: String, required: true, lowercase: true, trim: true, index: true },
          permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdminPermission' }],
          department: { type: String, trim: true },
          isActive: { type: Boolean, default: true, index: true },
          isEmailVerified: { type: Boolean, default: false },
          mfaEnabled: { type: Boolean, default: false },
          mfaSecret: { type: String }
        },
        { timestamps: true, collection: 'admin_users' }
      );

      // Register models with current connection
      AdminRole = mongoose.model('AdminRole', adminRoleSchema);
      AdminUser = mongoose.model('AdminUser', adminUserSchema);

      logger.info('Models registered with current connection', {
        connectionReady: mongoose.connection.readyState
      });

      // Run seeder
      const result = await seedDevData();
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
