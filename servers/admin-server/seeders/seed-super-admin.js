/**
 * @fileoverview Seed Super Admin
 * @module servers/admin-server/seeders/seed-super-admin
 * @description Seeds the initial super admin user
 * @version 1.0.0
 */

'use strict';

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'seed-super-admin' });

// Import models dynamically to avoid buffering timeout issues
let AdminUser;
let AdminRole;

/**
 * Seed super admin user
 * @returns {Promise<Object>} Seeding result
 */
async function seedSuperAdmin() {
  try {
    logger.info('Starting super admin seeding');

    // Check if super admin already exists
    const existingSuperAdmin = await AdminUser.findOne({ role: 'super_admin' });

    if (existingSuperAdmin) {
      logger.info('Super admin already exists', { email: existingSuperAdmin.email });
      return {
        success: true,
        message: 'Super admin already exists',
        email: existingSuperAdmin.email
      };
    }

    // Get super_admin role
    const superAdminRole = await AdminRole.findOne({ name: 'super_admin' });

    if (!superAdminRole) {
      throw new Error('Super admin role not found. Please run seed-roles first.');
    }

    // Get super admin credentials from environment or use defaults
    const email = process.env.SUPER_ADMIN_EMAIL || 'superadmin@insightserenity.com';
    const password = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!';
    const firstName = process.env.SUPER_ADMIN_FIRST_NAME || 'Super';
    const lastName = process.env.SUPER_ADMIN_LAST_NAME || 'Admin';

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create super admin user
    const superAdmin = await AdminUser.create({
      email: email.toLowerCase(),
      firstName,
      lastName,
      passwordHash,
      role: 'super_admin',
      permissions: superAdminRole.permissions,
      department: 'system',
      isActive: true,
      isEmailVerified: true,
      mfaEnabled: false
    });

    logger.info('Super admin created successfully', {
      id: superAdmin._id,
      email: superAdmin.email
    });

    // Log warning if using default credentials
    if (!process.env.SUPER_ADMIN_EMAIL || !process.env.SUPER_ADMIN_PASSWORD) {
      logger.warn('Using default super admin credentials. CHANGE IMMEDIATELY in production!', {
        email,
        note: 'Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD environment variables'
      });
    }

    return {
      success: true,
      message: 'Super admin created successfully',
      user: {
        id: superAdmin._id.toString(),
        email: superAdmin.email,
        firstName: superAdmin.firstName,
        lastName: superAdmin.lastName,
        role: superAdmin.role
      },
      credentials: process.env.NODE_ENV === 'development' ? {
        email,
        password,
        warning: 'Change these credentials immediately!'
      } : undefined
    };
  } catch (error) {
    logger.error('Super admin seeding failed', {
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
module.exports = seedSuperAdmin;

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
      const result = await seedSuperAdmin();
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
