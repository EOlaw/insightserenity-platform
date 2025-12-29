/**
 * @fileoverview Master Seeder
 * @module servers/admin-server/seeders
 * @description Master seeder that runs all seeders in correct order
 * @version 1.0.0
 */

'use strict';

const mongoose = require('mongoose');
const seedPermissions = require('./seed-permissions');
const seedRoles = require('./seed-roles');
const seedSuperAdmin = require('./seed-super-admin');
const seedDevData = require('./seed-dev-data');
const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'master-seeder' });

/**
 * Run all seeders
 * @param {Object} options - Seeding options
 * @param {boolean} options.includeDevData - Whether to include dev data
 * @returns {Promise<Object>} Seeding results
 */
async function runAllSeeders(options = {}) {
  const { includeDevData = process.env.NODE_ENV === 'development' } = options;

  try {
    logger.info('Starting master seeder');

    const results = {
      permissions: null,
      roles: null,
      superAdmin: null,
      devData: null
    };

    // Step 1: Seed permissions
    logger.info('Step 1/4: Seeding permissions');
    results.permissions = await seedPermissions();

    if (!results.permissions.success) {
      throw new Error('Permission seeding failed');
    }

    // Step 2: Seed roles
    logger.info('Step 2/4: Seeding roles');
    results.roles = await seedRoles();

    if (!results.roles.success) {
      throw new Error('Role seeding failed');
    }

    // Step 3: Seed super admin
    logger.info('Step 3/4: Seeding super admin');
    results.superAdmin = await seedSuperAdmin();

    if (!results.superAdmin.success) {
      throw new Error('Super admin seeding failed');
    }

    // Step 4: Seed dev data (optional)
    if (includeDevData) {
      logger.info('Step 4/4: Seeding development data');
      results.devData = await seedDevData();

      if (!results.devData.success) {
        logger.warn('Development data seeding failed, but continuing', {
          error: results.devData.error
        });
      }
    } else {
      logger.info('Step 4/4: Skipping development data (production mode)');
      results.devData = { success: true, message: 'Skipped (production mode)' };
    }

    logger.info('Master seeder completed successfully');

    return {
      success: true,
      message: 'All seeders completed',
      results
    };
  } catch (error) {
    logger.error('Master seeder failed', {
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
module.exports = {
  runAllSeeders,
  seedPermissions,
  seedRoles,
  seedSuperAdmin,
  seedDevData
};

// Allow running directly
if (require.main === module) {
  (async () => {
    try {
      // Load environment variables
      require('dotenv').config({ path: '../../../.env' });

      // Connect to database
      const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/insightserenity';
      logger.info('Connecting to database', { uri: mongoUri.replace(/\/\/.*@/, '//***@') });

      await mongoose.connect(mongoUri);
      logger.info('Database connected');

      // Run seeders
      const includeDevData = process.argv.includes('--dev');
      const result = await runAllSeeders({ includeDevData });

      console.log('\n' + '='.repeat(60));
      console.log('SEEDING RESULTS');
      console.log('='.repeat(60));
      console.log(JSON.stringify(result, null, 2));
      console.log('='.repeat(60) + '\n');

      // Display credentials if super admin was created
      if (result.results?.superAdmin?.credentials) {
        console.log('\n' + '!'.repeat(60));
        console.log('SUPER ADMIN CREDENTIALS');
        console.log('!'.repeat(60));
        console.log(JSON.stringify(result.results.superAdmin.credentials, null, 2));
        console.log('!'.repeat(60) + '\n');
      }

      // Display dev credentials if dev data was seeded
      if (result.results?.devData?.credentials) {
        console.log('\n' + '!'.repeat(60));
        console.log('DEVELOPMENT USER CREDENTIALS');
        console.log('!'.repeat(60));
        console.log(JSON.stringify(result.results.devData.credentials, null, 2));
        console.log('!'.repeat(60) + '\n');
      }

      // Disconnect
      await mongoose.disconnect();
      logger.info('Database disconnected');

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('Seeding failed:', error);
      logger.error('Fatal error', { error: error.message, stack: error.stack });
      process.exit(1);
    }
  })();
}
