'use strict';

/**
 * @fileoverview Central migration runner for executing database schema and data migrations
 * @module shared/lib/database/migrations/migration-runner
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
 * @class MigrationRunner
 * @description Manages the execution of database migrations with version control,
 * rollback support, and comprehensive error handling with cloud database resilience
 */
class MigrationRunner {
  /**
   * @private
   * @static
   * @readonly
   */
  static #MIGRATION_STATES = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    ROLLED_BACK: 'rolled_back'
  };

  static #MIGRATION_COLLECTION = 'migration_history';
  static #MIGRATION_LOCK_COLLECTION = 'migration_locks';
  static #LOCK_TIMEOUT = 300000; // 5 minutes
  static #migrations = new Map();
  static #isInitialized = false;

  // Enhanced timeout and retry configuration for cloud resilience
  static #COLLECTION_OPERATION_TIMEOUT = 120000; // 2 minutes
  static #COLLECTION_RETRY_ATTEMPTS = 3;
  static #COLLECTION_RETRY_DELAY = 5000; // 5 seconds
  static #COLLECTION_RETRY_BACKOFF = 2; // Exponential backoff multiplier

  /**
   * Initializes the migration runner
   * @static
   * @async
   * @param {Object} [options={}] - Initialization options
   * @param {string} [options.connectionName='default'] - Database connection name
   * @param {string} [options.migrationsPath] - Path to migrations directory
   * @param {boolean} [options.createCollections=true] - Auto-create migration collections
   * @returns {Promise<void>}
   * @throws {AppError} If initialization fails
   */
  static async initialize(options = {}) {
    try {
      const {
        connectionName = 'default',
        migrationsPath = __dirname,
        createCollections = true
      } = options;

      logger.info('Initializing migration runner', { connectionName, migrationsPath });

      // Get database connection
      const connection = ConnectionManager.getConnection(connectionName);
      if (!connection) {
        throw new AppError('No database connection found', 500, 'NO_CONNECTION');
      }

      // Store configuration
      MigrationRunner.#config = {
        connectionName,
        migrationsPath,
        connection
      };

      // Create migration collections if needed with enhanced resilience
      if (createCollections) {
        await MigrationRunner.#ensureCollections();
      }

      // Load available migrations
      await MigrationRunner.#loadMigrations();

      MigrationRunner.#isInitialized = true;

      logger.info('Migration runner initialized successfully', {
        migrationsCount: MigrationRunner.#migrations.size
      });

    } catch (error) {
      logger.error('Failed to initialize migration runner', error);
      throw new AppError(
        'Migration runner initialization failed',
        500,
        'MIGRATION_INIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Runs all pending migrations
   * @static
   * @async
   * @param {Object} [options={}] - Run options
   * @param {boolean} [options.dryRun=false] - Simulate without applying changes
   * @param {Array<string>} [options.only] - Run only specific migrations
   * @param {Array<string>} [options.skip] - Skip specific migrations
   * @param {boolean} [options.force=false] - Force run even if locked
   * @returns {Promise<Object>} Migration results
   * @throws {AppError} If migration fails
   */
  static async run(options = {}) {
    try {
      MigrationRunner.#ensureInitialized();

      const {
        dryRun = false,
        only = [],
        skip = [],
        force = false
      } = options;

      logger.info('Starting migration run', { dryRun, only, skip });

      // Acquire migration lock
      const lockId = await MigrationRunner.#acquireLock(force);

      try {
        // Get pending migrations
        const pendingMigrations = await MigrationRunner.#getPendingMigrations(only, skip);

        if (pendingMigrations.length === 0) {
          logger.info('No pending migrations found');
          return {
            success: true,
            migrationsRun: 0,
            message: 'All migrations are up to date'
          };
        }

        logger.info(`Found ${pendingMigrations.length} pending migrations`);

        const results = {
          success: true,
          migrationsRun: 0,
          migrations: [],
          errors: []
        };

        // Run each migration
        for (const migrationName of pendingMigrations) {
          try {
            const result = await MigrationRunner.#runMigration(migrationName, { dryRun });
            results.migrations.push(result);
            results.migrationsRun++;

            if (!dryRun) {
              await MigrationRunner.#recordMigration(migrationName, result);
            }

          } catch (error) {
            logger.error(`Migration ${migrationName} failed`, error);
            
            results.success = false;
            results.errors.push({
              migration: migrationName,
              error: error.message
            });

            // Stop on first error
            break;
          }
        }

        return results;

      } finally {
        // Release lock
        await MigrationRunner.#releaseLock(lockId);
      }

    } catch (error) {
      logger.error('Migration run failed', error);
      throw new AppError(
        'Failed to run migrations',
        500,
        'MIGRATION_RUN_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Rolls back migrations
   * @static
   * @async
   * @param {Object} [options={}] - Rollback options
   * @param {number} [options.steps=1] - Number of migrations to rollback
   * @param {string} [options.to] - Rollback to specific migration
   * @param {boolean} [options.dryRun=false] - Simulate rollback
   * @returns {Promise<Object>} Rollback results
   * @throws {AppError} If rollback fails
   */
  static async rollback(options = {}) {
    try {
      MigrationRunner.#ensureInitialized();

      const {
        steps = 1,
        to,
        dryRun = false
      } = options;

      logger.info('Starting migration rollback', { steps, to, dryRun });

      // Acquire migration lock
      const lockId = await MigrationRunner.#acquireLock();

      try {
        // Get migrations to rollback
        const migrationsToRollback = await MigrationRunner.#getMigrationsToRollback(steps, to);

        if (migrationsToRollback.length === 0) {
          logger.info('No migrations to rollback');
          return {
            success: true,
            migrationsRolledBack: 0,
            message: 'No migrations to rollback'
          };
        }

        const results = {
          success: true,
          migrationsRolledBack: 0,
          migrations: [],
          errors: []
        };

        // Rollback each migration in reverse order
        for (const migrationName of migrationsToRollback.reverse()) {
          try {
            const migration = MigrationRunner.#migrations.get(migrationName);
            
            if (!migration || !migration.down) {
              throw new Error(`Migration ${migrationName} does not support rollback`);
            }

            if (!dryRun) {
              await migration.down();
              await MigrationRunner.#updateMigrationStatus(
                migrationName,
                MigrationRunner.#MIGRATION_STATES.ROLLED_BACK
              );
            }

            results.migrations.push({
              name: migrationName,
              status: 'rolled_back'
            });
            results.migrationsRolledBack++;

            logger.info(`Rolled back migration: ${migrationName}`);

          } catch (error) {
            logger.error(`Rollback failed for ${migrationName}`, error);
            
            results.success = false;
            results.errors.push({
              migration: migrationName,
              error: error.message
            });

            // Stop on first error
            break;
          }
        }

        return results;

      } finally {
        // Release lock
        await MigrationRunner.#releaseLock(lockId);
      }

    } catch (error) {
      logger.error('Migration rollback failed', error);
      throw new AppError(
        'Failed to rollback migrations',
        500,
        'MIGRATION_ROLLBACK_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets migration status (primary method expected by migration tools)
   * @static
   * @async
   * @returns {Promise<Object>} Migration status information
   * @throws {AppError} If status retrieval fails
   */
  static async getStatus() {
    try {
      MigrationRunner.#ensureInitialized();

      logger.info('Retrieving migration status');

      const db = MigrationRunner.#config.connection.db;
      const collection = db.collection(MigrationRunner.#MIGRATION_COLLECTION);

      // Get completed migrations
      const completedMigrations = await collection
        .find({ status: MigrationRunner.#MIGRATION_STATES.COMPLETED })
        .sort({ executedAt: 1 })
        .toArray();

      // Get all available migrations
      const allMigrations = Array.from(MigrationRunner.#migrations.keys()).sort();

      // Determine pending migrations
      const completedNames = completedMigrations.map(m => m.name);
      const pendingMigrations = allMigrations.filter(name => !completedNames.includes(name));

      // Get failed migrations
      const failedMigrations = await collection
        .find({ status: MigrationRunner.#MIGRATION_STATES.FAILED })
        .toArray();

      const result = {
        totalMigrations: allMigrations.length,
        completedMigrations: completedMigrations.length,
        pendingMigrations: pendingMigrations.length,
        failedMigrations: failedMigrations.length,
        migrations: {
          completed: completedMigrations.map(m => ({
            name: m.name,
            executedAt: m.executedAt,
            duration: m.duration
          })),
          pending: pendingMigrations,
          failed: failedMigrations.map(m => ({
            name: m.name,
            failedAt: m.failedAt,
            error: m.error
          }))
        }
      };

      logger.info('Migration status retrieved', {
        totalMigrations: result.totalMigrations,
        completedMigrations: result.completedMigrations,
        pendingMigrations: result.pendingMigrations,
        failedMigrations: result.failedMigrations
      });

      return result;

    } catch (error) {
      logger.error('Failed to retrieve migration status', error);
      throw new AppError(
        'Migration status retrieval failed',
        500,
        'MIGRATION_STATUS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets migration status (legacy method for backward compatibility)
   * @static
   * @async
   * @returns {Promise<Object>} Migration status information
   */
  static async status() {
    try {
      MigrationRunner.#ensureInitialized();

      const db = MigrationRunner.#config.connection.db;
      const collection = db.collection(MigrationRunner.#MIGRATION_COLLECTION);

      // Get completed migrations
      const completedMigrations = await collection
        .find({ status: MigrationRunner.#MIGRATION_STATES.COMPLETED })
        .sort({ executedAt: 1 })
        .toArray();

      // Get all available migrations
      const allMigrations = Array.from(MigrationRunner.#migrations.keys()).sort();

      // Determine pending migrations
      const completedNames = completedMigrations.map(m => m.name);
      const pendingMigrations = allMigrations.filter(name => !completedNames.includes(name));

      // Get failed migrations
      const failedMigrations = await collection
        .find({ status: MigrationRunner.#MIGRATION_STATES.FAILED })
        .toArray();

      return {
        total: allMigrations.length,
        completed: completedMigrations.length,
        pending: pendingMigrations.length,
        failed: failedMigrations.length,
        migrations: {
          completed: completedMigrations.map(m => ({
            name: m.name,
            executedAt: m.executedAt,
            duration: m.duration
          })),
          pending: pendingMigrations,
          failed: failedMigrations.map(m => ({
            name: m.name,
            failedAt: m.failedAt,
            error: m.error
          }))
        }
      };

    } catch (error) {
      logger.error('Failed to get migration status', error);
      throw new AppError(
        'Failed to retrieve migration status',
        500,
        'MIGRATION_STATUS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates a new migration file
   * @static
   * @async
   * @param {string} name - Migration name
   * @param {Object} [options={}] - Creation options
   * @returns {Promise<string>} Created file path
   * @throws {AppError} If creation fails
   */
  static async create(name, options = {}) {
    try {
      if (!name) {
        throw new AppError('Migration name is required', 400, 'INVALID_NAME');
      }

      // Generate timestamp and filename
      const timestamp = new Date().getTime();
      const paddedNumber = String(MigrationRunner.#migrations.size + 1).padStart(3, '0');
      const filename = `${paddedNumber}-${name}.js`;
      const filepath = path.join(MigrationRunner.#config.migrationsPath, filename);

      // Migration template
      const template = `'use strict';

/**
 * @fileoverview ${name} migration
 * @module shared/lib/database/migrations/${filename}
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');

/**
 * @class ${name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, '')}Migration
 * @description ${options.description || 'Migration description'}
 */
class ${name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, '')}Migration {
  /**
   * Applies the migration
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {AppError} If migration fails
   */
  static async up() {
    try {
      logger.info('Running migration: ${name}');

      // TODO: Implement migration logic

      logger.info('Migration completed: ${name}');

    } catch (error) {
      logger.error('Migration failed: ${name}', error);
      throw new AppError(
        'Migration failed',
        500,
        'MIGRATION_ERROR',
        { migration: '${name}', originalError: error.message }
      );
    }
  }

  /**
   * Rolls back the migration
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {AppError} If rollback fails
   */
  static async down() {
    try {
      logger.info('Rolling back migration: ${name}');

      // TODO: Implement rollback logic

      logger.info('Rollback completed: ${name}');

    } catch (error) {
      logger.error('Rollback failed: ${name}', error);
      throw new AppError(
        'Rollback failed',
        500,
        'ROLLBACK_ERROR',
        { migration: '${name}', originalError: error.message }
      );
    }
  }
}

module.exports = ${name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, '')}Migration;
`;

      // Write file
      await fs.writeFile(filepath, template);

      logger.info('Created migration file', { filename, filepath });

      return filepath;

    } catch (error) {
      logger.error('Failed to create migration', error);
      throw new AppError(
        'Failed to create migration file',
        500,
        'MIGRATION_CREATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Ensures migration runner is initialized
   * @static
   * @throws {AppError} If not initialized
   */
  static #ensureInitialized() {
    if (!MigrationRunner.#isInitialized) {
      throw new AppError(
        'Migration runner not initialized',
        500,
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * @private
   * Ensures migration collections exist with enhanced cloud resilience
   * @static
   * @async
   * @returns {Promise<void>}
   */
  static async #ensureCollections() {
    const collectionsToCreate = [
      {
        name: MigrationRunner.#MIGRATION_COLLECTION,
        indexes: [{ name: 1 }],
        indexOptions: { unique: true }
      },
      {
        name: MigrationRunner.#MIGRATION_LOCK_COLLECTION,
        indexes: [{ expiresAt: 1 }],
        indexOptions: { expireAfterSeconds: 0 }
      }
    ];

    for (const collectionConfig of collectionsToCreate) {
      await MigrationRunner.#ensureCollectionWithRetry(collectionConfig);
    }
  }

  /**
   * @private
   * Ensures a single collection exists with comprehensive retry logic
   * @static
   * @async
   * @param {Object} collectionConfig - Collection configuration
   * @returns {Promise<void>}
   */
  static async #ensureCollectionWithRetry(collectionConfig) {
    const { name, indexes, indexOptions } = collectionConfig;
    let lastError;
    let delay = MigrationRunner.#COLLECTION_RETRY_DELAY;

    for (let attempt = 1; attempt <= MigrationRunner.#COLLECTION_RETRY_ATTEMPTS; attempt++) {
      try {
        logger.info(`Ensuring collection exists: ${name} (attempt ${attempt}/${MigrationRunner.#COLLECTION_RETRY_ATTEMPTS})`);

        const db = MigrationRunner.#config.connection.db;
        
        // Check if collection exists with timeout
        const collectionExists = await MigrationRunner.#checkCollectionExists(db, name);
        
        if (!collectionExists) {
          logger.info(`Creating collection: ${name}`);
          
          // Create collection with timeout protection
          await MigrationRunner.#createCollectionWithTimeout(db, name);
          
          logger.info(`Collection created successfully: ${name}`);
        } else {
          logger.info(`Collection already exists: ${name}`);
        }

        // Ensure indexes exist
        if (indexes && indexes.length > 0) {
          await MigrationRunner.#ensureIndexesWithTimeout(db, name, indexes, indexOptions);
        }

        // Success - exit retry loop
        return;

      } catch (error) {
        lastError = error;
        
        const isTimeout = error.name === 'MongoNetworkTimeoutError' || 
                         error.name === 'MongoTimeoutError' ||
                         error.message.includes('timed out');

        logger.warn(`Collection operation failed for ${name} (attempt ${attempt}/${MigrationRunner.#COLLECTION_RETRY_ATTEMPTS})`, {
          error: error.message,
          isTimeout,
          willRetry: attempt < MigrationRunner.#COLLECTION_RETRY_ATTEMPTS
        });

        if (attempt < MigrationRunner.#COLLECTION_RETRY_ATTEMPTS) {
          logger.info(`Retrying collection operation in ${delay}ms...`);
          await MigrationRunner.#delay(delay);
          delay *= MigrationRunner.#COLLECTION_RETRY_BACKOFF;
        }
      }
    }

    // Check if we should skip collection creation on timeout
    const skipOnTimeout = config.database?.migrations?.skipCollectionCreationOnTimeout ?? true;
    const isTimeoutError = lastError && (
      lastError.name === 'MongoNetworkTimeoutError' || 
      lastError.name === 'MongoTimeoutError' ||
      lastError.message.includes('timed out')
    );

    if (skipOnTimeout && isTimeoutError) {
      logger.warn(`Collection creation timed out for ${name}, continuing with migration (collections will be auto-created on first write)`, {
        error: lastError.message,
        skipOnTimeout
      });
      return;
    }

    // Throw error for non-timeout errors or when skip is disabled
    logger.error(`Failed to ensure collection after all retry attempts: ${name}`, lastError);
    throw lastError;
  }

  /**
   * @private
   * Checks if a collection exists with timeout protection
   * @static
   * @async
   * @param {Object} db - Database instance
   * @param {string} collectionName - Collection name
   * @returns {Promise<boolean>} Whether collection exists
   */
  static async #checkCollectionExists(db, collectionName) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Collection existence check timed out for: ${collectionName}`));
      }, MigrationRunner.#COLLECTION_OPERATION_TIMEOUT);

      try {
        const collections = await db.listCollections({ name: collectionName }).toArray();
        clearTimeout(timeout);
        resolve(collections.length > 0);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * @private
   * Creates a collection with timeout protection
   * @static
   * @async
   * @param {Object} db - Database instance
   * @param {string} collectionName - Collection name
   * @returns {Promise<void>}
   */
  static async #createCollectionWithTimeout(db, collectionName) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Collection creation timed out for: ${collectionName}`));
      }, MigrationRunner.#COLLECTION_OPERATION_TIMEOUT);

      try {
        await db.createCollection(collectionName);
        clearTimeout(timeout);
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        // Ignore error if collection already exists
        if (error.codeName === 'NamespaceExists') {
          logger.info(`Collection ${collectionName} already exists, ignoring creation error`);
          resolve();
        } else {
          reject(error);
        }
      }
    });
  }

  /**
   * @private
   * Ensures indexes exist with timeout protection
   * @static
   * @async
   * @param {Object} db - Database instance
   * @param {string} collectionName - Collection name
   * @param {Array} indexes - Index specifications
   * @param {Object} indexOptions - Index options
   * @returns {Promise<void>}
   */
  static async #ensureIndexesWithTimeout(db, collectionName, indexes, indexOptions = {}) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Index creation timed out for collection: ${collectionName}`));
      }, MigrationRunner.#COLLECTION_OPERATION_TIMEOUT);

      try {
        const collection = db.collection(collectionName);
        
        for (const indexSpec of indexes) {
          try {
            await collection.createIndex(indexSpec, indexOptions);
            logger.info(`Index created for collection ${collectionName}`, { indexSpec, indexOptions });
          } catch (indexError) {
            // Ignore error if index already exists
            if (indexError.codeName === 'IndexOptionsConflict' || indexError.codeName === 'IndexKeySpecsConflict') {
              logger.info(`Index already exists for collection ${collectionName}, ignoring creation error`);
            } else {
              throw indexError;
            }
          }
        }

        clearTimeout(timeout);
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * @private
   * Delays execution for specified milliseconds
   * @static
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  static async #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * @private
   * Loads migration files
   * @static
   * @async
   * @returns {Promise<void>}
   */
  static async #loadMigrations() {
    try {
      const files = await fs.readdir(MigrationRunner.#config.migrationsPath);
      const migrationFiles = files
        .filter(file => file.match(/^\d{3}-.+\.js$/) && file !== 'migration-runner.js')
        .sort();

      MigrationRunner.#migrations.clear();

      for (const file of migrationFiles) {
        const filepath = path.join(MigrationRunner.#config.migrationsPath, file);
        const MigrationClass = require(filepath);
        const migrationName = file.replace('.js', '');

        MigrationRunner.#migrations.set(migrationName, MigrationClass);
      }

      logger.info(`Loaded ${MigrationRunner.#migrations.size} migrations`);

    } catch (error) {
      logger.error('Failed to load migrations', error);
      throw error;
    }
  }

  /**
   * @private
   * Gets pending migrations
   * @static
   * @async
   * @param {Array<string>} only - Run only these migrations
   * @param {Array<string>} skip - Skip these migrations
   * @returns {Promise<Array<string>>} Pending migration names
   */
  static async #getPendingMigrations(only = [], skip = []) {
    try {
      const db = MigrationRunner.#config.connection.db;
      const collection = db.collection(MigrationRunner.#MIGRATION_COLLECTION);

      // Get completed migrations
      const completedMigrations = await collection
        .find({ status: MigrationRunner.#MIGRATION_STATES.COMPLETED })
        .project({ name: 1 })
        .toArray();

      const completedNames = completedMigrations.map(m => m.name);
      const allMigrations = Array.from(MigrationRunner.#migrations.keys()).sort();

      let pendingMigrations = allMigrations.filter(name => !completedNames.includes(name));

      // Apply filters
      if (only.length > 0) {
        pendingMigrations = pendingMigrations.filter(name => only.includes(name));
      }

      if (skip.length > 0) {
        pendingMigrations = pendingMigrations.filter(name => !skip.includes(name));
      }

      return pendingMigrations;

    } catch (error) {
      logger.error('Failed to get pending migrations', error);
      throw error;
    }
  }

  /**
   * @private
   * Runs a single migration
   * @static
   * @async
   * @param {string} migrationName - Migration name
   * @param {Object} options - Run options
   * @returns {Promise<Object>} Migration result
   */
  static async #runMigration(migrationName, options = {}) {
    const startTime = Date.now();
    const migration = MigrationRunner.#migrations.get(migrationName);

    if (!migration) {
      throw new Error(`Migration ${migrationName} not found`);
    }

    logger.info(`Running migration: ${migrationName}`);

    if (!options.dryRun) {
      // Execute migration with transaction support if available
      const session = await MigrationRunner.#config.connection.startSession();

      try {
        await session.withTransaction(async () => {
          await migration.up();
        });

      } finally {
        await session.endSession();
      }
    }

    const duration = Date.now() - startTime;

    logger.info(`Migration completed: ${migrationName}`, { duration });

    return {
      name: migrationName,
      status: MigrationRunner.#MIGRATION_STATES.COMPLETED,
      duration,
      executedAt: new Date()
    };
  }

  /**
   * @private
   * Records migration execution
   * @static
   * @async
   * @param {string} migrationName - Migration name
   * @param {Object} result - Migration result
   * @returns {Promise<void>}
   */
  static async #recordMigration(migrationName, result) {
    try {
      const db = MigrationRunner.#config.connection.db;
      const collection = db.collection(MigrationRunner.#MIGRATION_COLLECTION);

      await collection.replaceOne(
        { name: migrationName },
        {
          name: migrationName,
          ...result,
          updatedAt: new Date()
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Failed to record migration', error);
      throw error;
    }
  }

  /**
   * @private
   * Gets migrations to rollback
   * @static
   * @async
   * @param {number} steps - Number of steps to rollback
   * @param {string} to - Target migration
   * @returns {Promise<Array<string>>} Migrations to rollback
   */
  static async #getMigrationsToRollback(steps, to) {
    try {
      const db = MigrationRunner.#config.connection.db;
      const collection = db.collection(MigrationRunner.#MIGRATION_COLLECTION);

      let query = { status: MigrationRunner.#MIGRATION_STATES.COMPLETED };
      
      const completedMigrations = await collection
        .find(query)
        .sort({ executedAt: -1 })
        .toArray();

      if (to) {
        const targetIndex = completedMigrations.findIndex(m => m.name === to);
        if (targetIndex === -1) {
          throw new Error(`Target migration ${to} not found`);
        }
        return completedMigrations.slice(0, targetIndex).map(m => m.name);
      }

      return completedMigrations.slice(0, steps).map(m => m.name);

    } catch (error) {
      logger.error('Failed to get migrations to rollback', error);
      throw error;
    }
  }

  /**
   * @private
   * Updates migration status
   * @static
   * @async
   * @param {string} migrationName - Migration name
   * @param {string} status - New status
   * @returns {Promise<void>}
   */
  static async #updateMigrationStatus(migrationName, status) {
    try {
      const db = MigrationRunner.#config.connection.db;
      const collection = db.collection(MigrationRunner.#MIGRATION_COLLECTION);

      await collection.updateOne(
        { name: migrationName },
        {
          $set: {
            status,
            updatedAt: new Date()
          }
        }
      );

    } catch (error) {
      logger.error('Failed to update migration status', error);
      throw error;
    }
  }

  /**
   * @private
   * Acquires migration lock
   * @static
   * @async
   * @param {boolean} force - Force acquire lock
   * @returns {Promise<string>} Lock ID
   */
  static async #acquireLock(force = false) {
    try {
      const db = MigrationRunner.#config.connection.db;
      const collection = db.collection(MigrationRunner.#MIGRATION_LOCK_COLLECTION);
      const lockId = `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      if (!force) {
        // Check for existing locks
        const existingLock = await collection.findOne({
          active: true,
          expiresAt: { $gt: new Date() }
        });

        if (existingLock) {
          throw new AppError(
            'Migration already in progress',
            409,
            'MIGRATION_LOCKED'
          );
        }
      }

      // Create new lock
      await collection.insertOne({
        _id: lockId,
        active: true,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + MigrationRunner.#LOCK_TIMEOUT),
        hostname: require('os').hostname(),
        pid: process.pid
      });

      return lockId;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Failed to acquire lock', error);
      throw new AppError(
        'Failed to acquire migration lock',
        500,
        'LOCK_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Releases migration lock
   * @static
   * @async
   * @param {string} lockId - Lock ID
   * @returns {Promise<void>}
   */
  static async #releaseLock(lockId) {
    try {
      const db = MigrationRunner.#config.connection.db;
      const collection = db.collection(MigrationRunner.#MIGRATION_LOCK_COLLECTION);

      await collection.deleteOne({ _id: lockId });

    } catch (error) {
      logger.error('Failed to release lock', error);
      // Don't throw - lock will expire anyway
    }
  }

  /**
   * @private
   * Configuration storage
   * @static
   */
  static #config = null;
}

module.exports = MigrationRunner;