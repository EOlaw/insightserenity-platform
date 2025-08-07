'use strict';

/**
 * @fileoverview Central seed manager for executing database seeders with dependency management
 * @module shared/lib/database/seeders/seed-manager
 * @requires fs/promises
 * @requires path
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/database/transaction-manager
 * @requires module:shared/config
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const ConnectionManager = require('../connection-manager');
const TransactionManager = require('../transaction-manager');
const config = require('../../../config');

/**
 * @class SeedManager
 * @description Manages the execution of database seeders with dependency resolution,
 * environment-specific seeding, and comprehensive error handling
 */
class SeedManager {
  /**
   * @private
   * @static
   * @readonly
   */
  static #SEED_STATES = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped'
  };

  static #SEED_COLLECTION = 'seed_history';
  static #SEED_LOCK_COLLECTION = 'seed_locks';
  static #LOCK_TIMEOUT = 300000; // 5 minutes
  static #seeders = new Map();
  static #isInitialized = false;
  static #environment = null;

  /**
   * Initializes the seed manager
   * @static
   * @async
   * @param {Object} [options={}] - Initialization options
   * @param {string} [options.connectionName='default'] - Database connection name
   * @param {string} [options.seedersPath] - Path to seeders directory
   * @param {string} [options.environment] - Environment (development, staging, production)
   * @param {boolean} [options.createCollections=true] - Auto-create seed collections
   * @returns {Promise<void>}
   * @throws {AppError} If initialization fails
   */
  static async initialize(options = {}) {
    try {
      const {
        connectionName = 'default',
        seedersPath = __dirname,
        environment = process.env.NODE_ENV || 'development',
        createCollections = true
      } = options;

      logger.info('Initializing seed manager', { 
        connectionName, 
        seedersPath, 
        environment 
      });

      // Get database connection
      const connection = ConnectionManager.getConnection(connectionName);
      if (!connection) {
        throw new AppError('No database connection found', 500, 'NO_CONNECTION');
      }

      // Store configuration
      SeedManager.#config = {
        connectionName,
        seedersPath,
        connection,
        environment
      };

      SeedManager.#environment = environment;

      // Create seed collections if needed
      if (createCollections) {
        await SeedManager.#ensureCollections();
      }

      // Load available seeders
      await SeedManager.#loadSeeders();

      SeedManager.#isInitialized = true;

      logger.info('Seed manager initialized successfully', {
        seedersCount: SeedManager.#seeders.size,
        environment: SeedManager.#environment
      });

    } catch (error) {
      logger.error('Failed to initialize seed manager', error);
      throw new AppError(
        'Seed manager initialization failed',
        500,
        'SEED_INIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Runs seeders based on options
   * @static
   * @async
   * @param {Object} [options={}] - Run options
   * @param {boolean} [options.fresh=false] - Drop collections before seeding
   * @param {boolean} [options.force=false] - Force re-run completed seeders
   * @param {Array<string>} [options.only] - Run only specific seeders
   * @param {Array<string>} [options.skip] - Skip specific seeders
   * @param {boolean} [options.testData=false] - Include test data seeders
   * @returns {Promise<Object>} Seeding results
   * @throws {AppError} If seeding fails
   */
  static async seed(options = {}) {
    try {
      SeedManager.#ensureInitialized();

      const {
        fresh = false,
        force = false,
        only = [],
        skip = [],
        testData = SeedManager.#environment !== 'production'
      } = options;

      logger.info('Starting database seeding', { 
        fresh, 
        force, 
        only, 
        skip, 
        testData,
        environment: SeedManager.#environment 
      });

      // Acquire seed lock
      const lockId = await SeedManager.#acquireLock();

      try {
        // Fresh seed - clear existing data
        if (fresh) {
          await SeedManager.#freshSeed();
        }

        // Get seeders to run
        const seedersToRun = await SeedManager.#getSeedersToRun({
          force,
          only,
          skip,
          testData
        });

        if (seedersToRun.length === 0) {
          logger.info('No seeders to run');
          return {
            success: true,
            seedersRun: 0,
            message: 'All seeders are up to date'
          };
        }

        logger.info(`Running ${seedersToRun.length} seeders`);

        const results = {
          success: true,
          seedersRun: 0,
          seeders: [],
          errors: []
        };

        // Run each seeder
        for (const seederName of seedersToRun) {
          try {
            const result = await SeedManager.#runSeeder(seederName);
            results.seeders.push(result);
            results.seedersRun++;

            await SeedManager.#recordSeeder(seederName, result);

          } catch (error) {
            logger.error(`Seeder ${seederName} failed`, error);
            
            results.success = false;
            results.errors.push({
              seeder: seederName,
              error: error.message,
              stack: error.stack
            });

            // Stop on first error unless force is enabled
            if (!force) {
              break;
            }
          }
        }

        // Log summary
        SeedManager.#logSummary(results);

        return results;

      } finally {
        // Release lock
        await SeedManager.#releaseLock(lockId);
      }

    } catch (error) {
      logger.error('Database seeding failed', error);
      throw new AppError(
        'Failed to seed database',
        500,
        'SEED_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Resets specific seeders
   * @static
   * @async
   * @param {Object} [options={}] - Reset options
   * @param {Array<string>} [options.seeders] - Specific seeders to reset
   * @param {boolean} [options.all=false] - Reset all seeders
   * @returns {Promise<Object>} Reset results
   * @throws {AppError} If reset fails
   */
  static async reset(options = {}) {
    try {
      SeedManager.#ensureInitialized();

      const { seeders = [], all = false } = options;

      if (!all && seeders.length === 0) {
        throw new AppError(
          'Must specify seeders to reset or use --all flag',
          400,
          'INVALID_RESET_OPTIONS'
        );
      }

      logger.info('Resetting seeders', { seeders, all });

      const db = SeedManager.#config.connection.db;
      const collection = db.collection(SeedManager.#SEED_COLLECTION);

      if (all) {
        // Reset all seeders
        const result = await collection.deleteMany({});
        logger.info(`Reset ${result.deletedCount} seeder records`);

        return {
          success: true,
          resetCount: result.deletedCount,
          message: 'All seeders have been reset'
        };
      }

      // Reset specific seeders
      const result = await collection.deleteMany({
        name: { $in: seeders }
      });

      logger.info(`Reset ${result.deletedCount} seeder records`);

      return {
        success: true,
        resetCount: result.deletedCount,
        seeders: seeders,
        message: `Reset ${result.deletedCount} seeders`
      };

    } catch (error) {
      logger.error('Failed to reset seeders', error);
      throw new AppError(
        'Failed to reset seeders',
        500,
        'RESET_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets seeding status
   * @static
   * @async
   * @returns {Promise<Object>} Seeding status information
   */
  static async status() {
    try {
      SeedManager.#ensureInitialized();

      const db = SeedManager.#config.connection.db;
      const collection = db.collection(SeedManager.#SEED_COLLECTION);

      // Get completed seeders
      const completedSeeders = await collection
        .find({ status: SeedManager.#SEED_STATES.COMPLETED })
        .sort({ executedAt: 1 })
        .toArray();

      // Get all available seeders
      const allSeeders = Array.from(SeedManager.#seeders.keys()).sort();

      // Determine pending seeders
      const completedNames = completedSeeders.map(s => s.name);
      const pendingSeeders = allSeeders.filter(name => !completedNames.includes(name));

      // Get failed seeders
      const failedSeeders = await collection
        .find({ status: SeedManager.#SEED_STATES.FAILED })
        .toArray();

      // Get environment-specific stats
      const environmentStats = await collection.aggregate([
        {
          $group: {
            _id: '$environment',
            count: { $sum: 1 },
            lastRun: { $max: '$executedAt' }
          }
        }
      ]).toArray();

      return {
        environment: SeedManager.#environment,
        total: allSeeders.length,
        completed: completedSeeders.length,
        pending: pendingSeeders.length,
        failed: failedSeeders.length,
        seeders: {
          completed: completedSeeders.map(s => ({
            name: s.name,
            executedAt: s.executedAt,
            duration: s.duration,
            environment: s.environment
          })),
          pending: pendingSeeders,
          failed: failedSeeders.map(s => ({
            name: s.name,
            failedAt: s.failedAt,
            error: s.error,
            environment: s.environment
          }))
        },
        environmentStats
      };

    } catch (error) {
      logger.error('Failed to get seeding status', error);
      throw new AppError(
        'Failed to retrieve seeding status',
        500,
        'SEED_STATUS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates seed data integrity
   * @static
   * @async
   * @param {Object} [options={}] - Validation options
   * @returns {Promise<Object>} Validation results
   */
  static async validate(options = {}) {
    try {
      SeedManager.#ensureInitialized();

      logger.info('Validating seed data integrity');

      const results = {
        valid: true,
        issues: [],
        validations: []
      };

      // Run validation for each completed seeder
      const db = SeedManager.#config.connection.db;
      const collection = db.collection(SeedManager.#SEED_COLLECTION);
      
      const completedSeeders = await collection
        .find({ status: SeedManager.#SEED_STATES.COMPLETED })
        .toArray();

      for (const seederRecord of completedSeeders) {
        const seeder = SeedManager.#seeders.get(seederRecord.name);
        
        if (seeder && typeof seeder.validate === 'function') {
          try {
            const validation = await seeder.validate();
            results.validations.push({
              seeder: seederRecord.name,
              ...validation
            });

            if (!validation.valid) {
              results.valid = false;
              results.issues.push(...validation.issues);
            }

          } catch (error) {
            results.valid = false;
            results.issues.push({
              seeder: seederRecord.name,
              issue: 'Validation failed',
              error: error.message
            });
          }
        }
      }

      logger.info('Seed data validation completed', {
        valid: results.valid,
        issuesCount: results.issues.length
      });

      return results;

    } catch (error) {
      logger.error('Failed to validate seed data', error);
      throw new AppError(
        'Failed to validate seed data',
        500,
        'VALIDATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Ensures seed manager is initialized
   * @static
   * @throws {AppError} If not initialized
   */
  static #ensureInitialized() {
    if (!SeedManager.#isInitialized) {
      throw new AppError(
        'Seed manager not initialized',
        500,
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * @private
   * Ensures seed collections exist
   * @static
   * @async
   * @returns {Promise<void>}
   */
  static async #ensureCollections() {
    try {
      const db = SeedManager.#config.connection.db;
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);

      // Create seed history collection
      if (!collectionNames.includes(SeedManager.#SEED_COLLECTION)) {
        await db.createCollection(SeedManager.#SEED_COLLECTION);
        await db.collection(SeedManager.#SEED_COLLECTION).createIndex(
          { name: 1, environment: 1 },
          { unique: true }
        );
        await db.collection(SeedManager.#SEED_COLLECTION).createIndex(
          { status: 1 }
        );
        await db.collection(SeedManager.#SEED_COLLECTION).createIndex(
          { executedAt: -1 }
        );
      }

      // Create seed lock collection
      if (!collectionNames.includes(SeedManager.#SEED_LOCK_COLLECTION)) {
        await db.createCollection(SeedManager.#SEED_LOCK_COLLECTION);
        await db.collection(SeedManager.#SEED_LOCK_COLLECTION).createIndex(
          { expiresAt: 1 },
          { expireAfterSeconds: 0 }
        );
      }

    } catch (error) {
      logger.error('Failed to ensure collections', error);
      throw error;
    }
  }

  /**
   * @private
   * Loads seeder files
   * @static
   * @async
   * @returns {Promise<void>}
   */
  static async #loadSeeders() {
    try {
      const files = await fs.readdir(SeedManager.#config.seedersPath);
      const seederFiles = files
        .filter(file => file.match(/^\d{3}-.+\.js$/) && file !== 'seed-manager.js')
        .sort();

      SeedManager.#seeders.clear();

      for (const file of seederFiles) {
        const filepath = path.join(SeedManager.#config.seedersPath, file);
        const SeederClass = require(filepath);
        const seederName = file.replace('.js', '');

        // Validate seeder class
        if (!SeederClass.up || typeof SeederClass.up !== 'function') {
          logger.warn(`Seeder ${seederName} missing up() method, skipping`);
          continue;
        }

        SeedManager.#seeders.set(seederName, SeederClass);
      }

      logger.info(`Loaded ${SeedManager.#seeders.size} seeders`);

    } catch (error) {
      logger.error('Failed to load seeders', error);
      throw error;
    }
  }

  /**
   * @private
   * Gets seeders to run
   * @static
   * @async
   * @param {Object} options - Filter options
   * @returns {Promise<Array<string>>} Seeder names to run
   */
  static async #getSeedersToRun(options) {
    try {
      const { force, only, skip, testData } = options;

      const db = SeedManager.#config.connection.db;
      const collection = db.collection(SeedManager.#SEED_COLLECTION);

      // Get completed seeders for current environment
      const completedSeeders = force ? [] : await collection
        .find({ 
          status: SeedManager.#SEED_STATES.COMPLETED,
          environment: SeedManager.#environment
        })
        .project({ name: 1 })
        .toArray();

      const completedNames = completedSeeders.map(s => s.name);
      let allSeeders = Array.from(SeedManager.#seeders.keys()).sort();

      // Filter out test data seeders in production
      if (!testData) {
        allSeeders = allSeeders.filter(name => !name.includes('test-data'));
      }

      let seedersToRun = allSeeders.filter(name => !completedNames.includes(name));

      // Apply filters
      if (only.length > 0) {
        seedersToRun = seedersToRun.filter(name => only.includes(name));
      }

      if (skip.length > 0) {
        seedersToRun = seedersToRun.filter(name => !skip.includes(name));
      }

      return seedersToRun;

    } catch (error) {
      logger.error('Failed to get seeders to run', error);
      throw error;
    }
  }

  /**
   * @private
   * Runs a single seeder
   * @static
   * @async
   * @param {string} seederName - Seeder name
   * @returns {Promise<Object>} Seeder result
   */
  static async #runSeeder(seederName) {
    const startTime = Date.now();
    const seeder = SeedManager.#seeders.get(seederName);

    if (!seeder) {
      throw new Error(`Seeder ${seederName} not found`);
    }

    logger.info(`Running seeder: ${seederName}`);

    // Execute seeder with transaction support
    const session = await SeedManager.#config.connection.startSession();

    try {
      let recordsSeeded = 0;

      await session.withTransaction(async () => {
        const result = await seeder.up({
          environment: SeedManager.#environment,
          session
        });

        recordsSeeded = result?.recordsSeeded || 0;
      });

      const duration = Date.now() - startTime;

      logger.info(`Seeder completed: ${seederName}`, { 
        duration, 
        recordsSeeded 
      });

      return {
        name: seederName,
        status: SeedManager.#SEED_STATES.COMPLETED,
        duration,
        recordsSeeded,
        executedAt: new Date(),
        environment: SeedManager.#environment
      };

    } catch (error) {
      logger.error(`Seeder failed: ${seederName}`, error);
      throw error;

    } finally {
      await session.endSession();
    }
  }

  /**
   * @private
   * Records seeder execution
   * @static
   * @async
   * @param {string} seederName - Seeder name
   * @param {Object} result - Seeder result
   * @returns {Promise<void>}
   */
  static async #recordSeeder(seederName, result) {
    try {
      const db = SeedManager.#config.connection.db;
      const collection = db.collection(SeedManager.#SEED_COLLECTION);

      await collection.replaceOne(
        { 
          name: seederName,
          environment: SeedManager.#environment
        },
        {
          name: seederName,
          ...result,
          updatedAt: new Date()
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Failed to record seeder', error);
      throw error;
    }
  }

  /**
   * @private
   * Performs fresh seed by dropping collections
   * @static
   * @async
   * @returns {Promise<void>}
   */
  static async #freshSeed() {
    try {
      logger.warn('Performing fresh seed - dropping existing data');

      const db = SeedManager.#config.connection.db;
      const collections = await db.listCollections().toArray();
      
      const protectedCollections = [
        SeedManager.#SEED_COLLECTION,
        SeedManager.#SEED_LOCK_COLLECTION,
        'migration_history',
        'migration_locks'
      ];

      for (const collection of collections) {
        if (!protectedCollections.includes(collection.name)) {
          await db.dropCollection(collection.name);
          logger.info(`Dropped collection: ${collection.name}`);
        }
      }

      // Clear seed history for current environment
      await db.collection(SeedManager.#SEED_COLLECTION).deleteMany({
        environment: SeedManager.#environment
      });

    } catch (error) {
      logger.error('Failed to perform fresh seed', error);
      throw error;
    }
  }

  /**
   * @private
   * Acquires seed lock
   * @static
   * @async
   * @returns {Promise<string>} Lock ID
   */
  static async #acquireLock() {
    try {
      const db = SeedManager.#config.connection.db;
      const collection = db.collection(SeedManager.#SEED_LOCK_COLLECTION);
      const lockId = `seed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Check for existing locks
      const existingLock = await collection.findOne({
        active: true,
        expiresAt: { $gt: new Date() }
      });

      if (existingLock) {
        throw new AppError(
          'Seeding already in progress',
          409,
          'SEED_LOCKED'
        );
      }

      // Create new lock
      await collection.insertOne({
        _id: lockId,
        active: true,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + SeedManager.#LOCK_TIMEOUT),
        hostname: require('os').hostname(),
        pid: process.pid,
        environment: SeedManager.#environment
      });

      return lockId;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Failed to acquire lock', error);
      throw new AppError(
        'Failed to acquire seed lock',
        500,
        'LOCK_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Releases seed lock
   * @static
   * @async
   * @param {string} lockId - Lock ID
   * @returns {Promise<void>}
   */
  static async #releaseLock(lockId) {
    try {
      const db = SeedManager.#config.connection.db;
      const collection = db.collection(SeedManager.#SEED_LOCK_COLLECTION);

      await collection.deleteOne({ _id: lockId });

    } catch (error) {
      logger.error('Failed to release lock', error);
      // Don't throw - lock will expire anyway
    }
  }

  /**
   * @private
   * Logs seeding summary
   * @static
   * @param {Object} results - Seeding results
   */
  static #logSummary(results) {
    const summary = [
      '',
      '=== Seeding Summary ===',
      `Environment: ${SeedManager.#environment}`,
      `Total Seeders Run: ${results.seedersRun}`,
      `Success: ${results.success}`,
      `Errors: ${results.errors.length}`,
      ''
    ];

    if (results.seeders.length > 0) {
      summary.push('Completed Seeders:');
      results.seeders.forEach(s => {
        summary.push(`  ✓ ${s.name} (${s.duration}ms, ${s.recordsSeeded} records)`);
      });
      summary.push('');
    }

    if (results.errors.length > 0) {
      summary.push('Failed Seeders:');
      results.errors.forEach(e => {
        summary.push(`  ✗ ${e.seeder}: ${e.error}`);
      });
      summary.push('');
    }

    summary.push('======================');

    logger.info(summary.join('\n'));
  }

  /**
   * @private
   * Configuration storage
   * @static
   */
  static #config = null;
}

module.exports = SeedManager;