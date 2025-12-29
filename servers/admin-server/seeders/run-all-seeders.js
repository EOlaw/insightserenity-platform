/**
 * @fileoverview Run All Seeders
 * @module servers/admin-server/seeders/run-all-seeders
 * @description Runs all seeders in the correct order
 * @version 1.0.0
 */

'use strict';

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'run-all-seeders' });

/**
 * Run all seeders in sequence
 */
async function runAllSeeders() {
  try {
    // Connect to database
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

    // Run seeders in order
    const seeders = [
      { name: 'Permissions', file: './seed-permissions' },
      { name: 'Roles', file: './seed-roles' },
      { name: 'Super Admin', file: './seed-super-admin' },
      { name: 'Dev Data', file: './seed-dev-data' }
    ];

    const results = [];

    for (const seeder of seeders) {
      logger.info(`Running ${seeder.name} seeder...`);
      try {
        const seederFn = require(seeder.file);
        const result = await seederFn();
        results.push({ seeder: seeder.name, ...result });
        logger.info(`${seeder.name} seeder completed`, { success: result.success });
      } catch (error) {
        logger.error(`${seeder.name} seeder failed`, { error: error.message });
        results.push({ seeder: seeder.name, success: false, error: error.message });
      }
    }

    // Disconnect
    await mongoose.disconnect();
    logger.info('Database disconnected');

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('SEEDING SUMMARY');
    console.log('='.repeat(70));
    results.forEach(result => {
      console.log(`${result.seeder.padEnd(20)} ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      if (result.message) console.log(`  ${result.message}`);
      if (result.error) console.log(`  Error: ${result.error}`);
    });
    console.log('='.repeat(70) + '\n');

    const allSuccess = results.every(r => r.success);
    process.exit(allSuccess ? 0 : 1);
  } catch (error) {
    logger.error('Seeding process failed', { error: error.message, stack: error.stack });
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllSeeders();
}

module.exports = runAllSeeders;
