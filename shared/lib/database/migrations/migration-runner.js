'use strict';

/**
 * @fileoverview Database migration runner with version control and rollback
 * @module shared/lib/database/migrations/migration-runner
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/database/transaction-manager
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires fs/promises
 * @requires path
 * @requires crypto
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const ConnectionManager = require('../connection-manager');
const TransactionManager = require('../transaction-manager');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');

/**
 * @class MigrationRunner
 * @description Manages database migrations with version control
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
    ROLLED_BACK: 'rolled-back'
  };

  static #MIGRATION_TYPES = {
    SCHEMA: 'schema',
    DATA: 'data',
    INDEX: 'index',
    PROCEDURE: 'procedure',
    HOTFIX: 'hotfix'
  };

  static #DEFAULT_OPTIONS = {
    migrationsPath: './migrations',
    pattern: /^\d{3}-.*\.js$/,
    tableName: '_migrations',
    transactional: true,
    validateChecksum: true,
    lock: true,
    lockTimeout: 60000,
    dryRun: false
  };

  static #migrationHistory = new Map();
  static #activeMigrations = new Map();
  static #migrationLock = null;

  /**
   * Creates an instance of MigrationRunner
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.migrationsPath] - Path to migration files
   * @param {string} [options.tableName] - Migrations table name
   * @param {boolean} [options.transactional=true] - Use transactions
   * @param {boolean} [options.validateChecksum=true] - Validate migration checksums
   * @param {Object} [options.transactionManager] - Transaction manager instance
   */
  constructor(options = {}) {
    this.options = {
      ...MigrationRunner.#DEFAULT_OPTIONS,
      ...options
    };

    this.transactionManager = options.transactionManager || new TransactionManager();
    this.migrationsPath = path.resolve(this.options.migrationsPath);
    this.migrationRegistry = new Map();
    this.appliedMigrations = new Map();
  }

  /**
   * Initializes migration runner
   * @async
   * @param {Object} [options={}] - Initialization options
   * @returns {Promise<void>}
   * @throws {AppError} If initialization fails
   */
  async initialize(options = {}) {
    try {
      // Ensure migrations directory exists
      await fs.mkdir(this.migrationsPath, { recursive: true });

      // Create migrations table if needed
      await this.#ensureMigrationsTable();

      // Load migration history
      await this.#loadMigrationHistory();

      // Discover available migrations
      await this.#discoverMigrations();

      logger.info('MigrationRunner initialized', {
        migrationsPath: this.migrationsPath,
        discoveredMigrations: this.migrationRegistry.size,
        appliedMigrations: this.appliedMigrations.size
      });

    } catch (error) {
      logger.error('Failed to initialize MigrationRunner', error);

      throw new AppError(
        'MigrationRunner initialization failed',
        500,
        'MIGRATION_INIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Runs pending migrations
   * @async
   * @param {Object} [options={}] - Migration options
   * @param {number} [options.target] - Target migration version
   * @param {boolean} [options.force=false] - Force run even with checksum mismatch
   * @param {Array<string>} [options.only] - Only run specific migrations
   * @param {Array<string>} [options.skip] - Skip specific migrations
   * @returns {Promise<Object>} Migration result
   * @throws {AppError} If migration fails
   */
  async migrate(options = {}) {
    const runId = this.#generateRunId();
    const startTime = Date.now();

    try {
      const {
        target,
        force = false,
        only = [],
        skip = [],
        fake = false
      } = options;

      // Acquire migration lock
      if (this.options.lock) {
        await this.#acquireLock();
      }

      logger.info('Starting migration run', {
        runId,
        target,
        force,
        dryRun: this.options.dryRun
      });

      // Initialize run context
      const runContext = {
        id: runId,
        state: MigrationRunner.#MIGRATION_STATES.RUNNING,
        startTime,
        migrations: [],
        successful: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        options
      };

      MigrationRunner.#activeMigrations.set(runId, runContext);

      // Get migrations to run
      const migrationsToRun = await this.#getMigrationsToRun({
        target,
        only,
        skip
      });

      if (migrationsToRun.length === 0) {
        logger.info('No migrations to run');
        runContext.state = MigrationRunner.#MIGRATION_STATES.COMPLETED;
        return this.#completeRun(runContext);
      }

      // Validate migrations
      if (this.options.validateChecksum && !force) {
        await this.#validateMigrations(migrationsToRun);
      }

      // Execute migrations
      for (const migration of migrationsToRun) {
        const migrationContext = {
          name: migration.name,
          version: migration.version,
          startTime: Date.now(),
          state: MigrationRunner.#MIGRATION_STATES.PENDING
        };

        runContext.migrations.push(migrationContext);

        try {
          if (fake) {
            // Mark as applied without running
            await this.#recordMigration(migration, { fake: true });
          } else if (this.options.transactional && migration.transactional !== false) {
            // Run with transaction
            await this.transactionManager.withTransaction(async (txn) => {
              await this.#executeMigration(migration, txn);
            });
          } else {
            // Run without transaction
            await this.#executeMigration(migration);
          }

          migrationContext.state = MigrationRunner.#MIGRATION_STATES.COMPLETED;
          migrationContext.endTime = Date.now();
          migrationContext.duration = migrationContext.endTime - migrationContext.startTime;
          runContext.successful++;

          if (!fake) {
            await this.#recordMigration(migration);
          }

        } catch (error) {
          migrationContext.state = MigrationRunner.#MIGRATION_STATES.FAILED;
          migrationContext.endTime = Date.now();
          migrationContext.duration = migrationContext.endTime - migrationContext.startTime;
          migrationContext.error = error.message;
          runContext.failed++;
          runContext.errors.push({
            migration: migration.name,
            error: error.message
          });

          logger.error('Migration execution failed', {
            migration: migration.name,
            error: error.message
          });

          // Stop on first failure
          throw error;
        }
      }

      // Complete run
      runContext.state = MigrationRunner.#MIGRATION_STATES.COMPLETED;
      return this.#completeRun(runContext);

    } catch (error) {
      logger.error('Migration run failed', error);

      const runContext = MigrationRunner.#activeMigrations.get(runId);
      if (runContext) {
        runContext.state = MigrationRunner.#MIGRATION_STATES.FAILED;
        runContext.error = error.message;
        this.#completeRun(runContext);
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Migration run failed',
        500,
        'MIGRATION_RUN_ERROR',
        { originalError: error.message }
      );

    } finally {
      // Release lock
      if (this.options.lock) {
        await this.#releaseLock();
      }
    }
  }

  /**
   * Rolls back migrations
   * @async
   * @param {Object} [options={}] - Rollback options
   * @param {number} [options.steps=1] - Number of migrations to rollback
   * @param {number} [options.target] - Target version to rollback to
   * @param {boolean} [options.force=false] - Force rollback
   * @returns {Promise<Object>} Rollback result
   * @throws {AppError} If rollback fails
   */
  async rollback(options = {}) {
    try {
      const {
        steps = 1,
        target,
        force = false
      } = options;

      // Acquire migration lock
      if (this.options.lock) {
        await this.#acquireLock();
      }

      logger.info('Starting migration rollback', options);

      const migrationsToRollback = await this.#getMigrationsToRollback({
        steps,
        target
      });

      if (migrationsToRollback.length === 0) {
        logger.info('No migrations to rollback');
        return {
          rolledBack: 0,
          migrations: []
        };
      }

      const results = {
        rolledBack: 0,
        failed: 0,
        migrations: []
      };

      // Rollback in reverse order
      for (const migration of migrationsToRollback.reverse()) {
        try {
          if (this.options.transactional && migration.transactional !== false) {
            await this.transactionManager.withTransaction(async (txn) => {
              await this.#rollbackMigration(migration, txn);
            });
          } else {
            await this.#rollbackMigration(migration);
          }

          results.rolledBack++;
          results.migrations.push({
            name: migration.name,
            version: migration.version,
            status: 'rolled-back'
          });

          await this.#removeMigrationRecord(migration);

        } catch (error) {
          results.failed++;
          results.migrations.push({
            name: migration.name,
            version: migration.version,
            status: 'failed',
            error: error.message
          });

          if (!force) {
            throw error;
          }
        }
      }

      logger.info('Migration rollback completed', {
        rolledBack: results.rolledBack,
        failed: results.failed
      });

      return results;

    } catch (error) {
      logger.error('Migration rollback failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Migration rollback failed',
        500,
        'MIGRATION_ROLLBACK_ERROR',
        { originalError: error.message }
      );

    } finally {
      // Release lock
      if (this.options.lock) {
        await this.#releaseLock();
      }
    }
  }

  /**
   * Gets migration status
   * @async
   * @param {Object} [options={}] - Status options
   * @returns {Promise<Object>} Migration status
   */
  async status(options = {}) {
    try {
      const { detailed = false } = options;

      const applied = Array.from(this.appliedMigrations.values())
        .sort((a, b) => a.version - b.version);

      const pending = [];
      const available = Array.from(this.migrationRegistry.values())
        .sort((a, b) => a.version - b.version);

      for (const migration of available) {
        if (!this.appliedMigrations.has(migration.name)) {
          pending.push(migration);
        }
      }

      const status = {
        applied: applied.length,
        pending: pending.length,
        total: available.length,
        lastApplied: applied[applied.length - 1] || null,
        nextPending: pending[0] || null
      };

      if (detailed) {
        status.appliedMigrations = applied.map(m => ({
          name: m.name,
          version: m.version,
          appliedAt: m.appliedAt,
          duration: m.duration
        }));

        status.pendingMigrations = pending.map(m => ({
          name: m.name,
          version: m.version,
          type: m.type,
          description: m.description
        }));
      }

      return status;

    } catch (error) {
      logger.error('Failed to get migration status', error);

      throw new AppError(
        'Failed to get migration status',
        500,
        'MIGRATION_STATUS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates a new migration file
   * @async
   * @param {string} name - Migration name
   * @param {Object} [options={}] - Creation options
   * @returns {Promise<Object>} Created migration info
   * @throws {AppError} If creation fails
   */
  async create(name, options = {}) {
    try {
      if (!name) {
        throw new AppError('Migration name is required', 400, 'MISSING_MIGRATION_NAME');
      }

      const {
        type = MigrationRunner.#MIGRATION_TYPES.SCHEMA,
        template = 'default'
      } = options;

      // Generate filename
      const timestamp = Date.now();
      const version = await this.#getNextVersion();
      const fileName = `${version.toString().padStart(3, '0')}-${name}.js`;
      const filePath = path.join(this.migrationsPath, fileName);

      // Check if file exists
      try {
        await fs.access(filePath);
        throw new AppError('Migration file already exists', 409, 'MIGRATION_EXISTS');
      } catch (error) {
        // File doesn't exist, continue
      }

      // Generate migration content
      const content = this.#generateMigrationContent(name, {
        type,
        template,
        timestamp,
        version
      });

      // Write migration file
      await fs.writeFile(filePath, content, 'utf8');

      logger.info('Migration file created', {
        fileName,
        name,
        type,
        version
      });

      return {
        fileName,
        filePath,
        name,
        type,
        version,
        timestamp
      };

    } catch (error) {
      logger.error('Failed to create migration', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Migration creation failed',
        500,
        'MIGRATION_CREATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates migration integrity
   * @async
   * @param {Object} [options={}] - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validate(options = {}) {
    try {
      const results = {
        valid: true,
        errors: [],
        warnings: []
      };

      // Check for duplicate versions
      const versions = new Map();
      for (const [name, migration] of this.migrationRegistry) {
        if (versions.has(migration.version)) {
          results.valid = false;
          results.errors.push({
            type: 'duplicate-version',
            version: migration.version,
            migrations: [versions.get(migration.version), name]
          });
        }
        versions.set(migration.version, name);
      }

      // Check for checksum mismatches
      for (const [name, applied] of this.appliedMigrations) {
        const current = this.migrationRegistry.get(name);
        
        if (!current) {
          results.warnings.push({
            type: 'missing-file',
            migration: name,
            message: 'Applied migration file not found'
          });
          continue;
        }

        if (applied.checksum !== current.checksum) {
          results.valid = false;
          results.errors.push({
            type: 'checksum-mismatch',
            migration: name,
            expected: applied.checksum,
            actual: current.checksum
          });
        }
      }

      // Check for gaps in version sequence
      const sortedVersions = Array.from(versions.keys()).sort((a, b) => a - b);
      for (let i = 1; i < sortedVersions.length; i++) {
        if (sortedVersions[i] - sortedVersions[i - 1] > 1) {
          results.warnings.push({
            type: 'version-gap',
            between: [sortedVersions[i - 1], sortedVersions[i]]
          });
        }
      }

      logger.info('Migration validation completed', {
        valid: results.valid,
        errors: results.errors.length,
        warnings: results.warnings.length
      });

      return results;

    } catch (error) {
      logger.error('Failed to validate migrations', error);

      throw new AppError(
        'Migration validation failed',
        500,
        'MIGRATION_VALIDATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Ensures migrations table exists
   * @async
   */
  async #ensureMigrationsTable() {
    try {
      const connection = ConnectionManager.getConnection();
      
      if (!connection) {
        throw new AppError('No database connection', 500, 'NO_CONNECTION');
      }

      // Create migrations collection/table
      const db = connection.db;
      const collections = await db.listCollections({ name: this.options.tableName }).toArray();
      
      if (collections.length === 0) {
        await db.createCollection(this.options.tableName);
        
        // Create indexes
        await db.collection(this.options.tableName).createIndex(
          { version: 1 },
          { unique: true }
        );
        
        await db.collection(this.options.tableName).createIndex(
          { name: 1 },
          { unique: true }
        );

        logger.info('Migrations table created', {
          tableName: this.options.tableName
        });
      }

    } catch (error) {
      logger.error('Failed to ensure migrations table', error);
      throw error;
    }
  }

  /**
   * @private
   * Loads migration history from database
   * @async
   */
  async #loadMigrationHistory() {
    try {
      const connection = ConnectionManager.getConnection();
      
      if (!connection) {
        return;
      }

      const migrations = await connection.db
        .collection(this.options.tableName)
        .find()
        .sort({ version: 1 })
        .toArray();

      this.appliedMigrations.clear();
      migrations.forEach(record => {
        this.appliedMigrations.set(record.name, record);
        MigrationRunner.#migrationHistory.set(record.name, record);
      });

      logger.info('Migration history loaded', {
        appliedCount: this.appliedMigrations.size
      });

    } catch (error) {
      logger.warn('Failed to load migration history', error);
    }
  }

  /**
   * @private
   * Discovers available migration files
   * @async
   */
  async #discoverMigrations() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      const migrationFiles = files.filter(file => this.options.pattern.test(file));

      this.migrationRegistry.clear();

      for (const file of migrationFiles) {
        const filePath = path.join(this.migrationsPath, file);
        const migration = await this.#loadMigration(filePath);
        
        if (migration) {
          this.migrationRegistry.set(migration.name, migration);
        }
      }

      logger.debug('Migrations discovered', {
        count: this.migrationRegistry.size
      });

    } catch (error) {
      logger.error('Failed to discover migrations', error);
    }
  }

  /**
   * @private
   * Loads a migration file
   * @async
   * @param {string} filePath - Migration file path
   * @returns {Promise<Object|null>} Migration info
   */
  async #loadMigration(filePath) {
    try {
      // Clear from require cache for fresh load
      delete require.cache[require.resolve(filePath)];
      
      const migrationModule = require(filePath);
      const fileName = path.basename(filePath);
      const match = fileName.match(/^(\d{3})-(.*)\.js$/);

      if (!match) {
        logger.warn('Invalid migration filename', { fileName });
        return null;
      }

      const [, version, name] = match;

      // Calculate checksum
      const content = await fs.readFile(filePath, 'utf8');
      const checksum = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex');

      return {
        name,
        fileName,
        filePath,
        version: parseInt(version, 10),
        type: migrationModule.type || MigrationRunner.#MIGRATION_TYPES.SCHEMA,
        description: migrationModule.description || '',
        up: migrationModule.up,
        down: migrationModule.down,
        checksum,
        transactional: migrationModule.transactional !== false
      };

    } catch (error) {
      logger.error('Failed to load migration', {
        filePath,
        error: error.message
      });
      return null;
    }
  }

  /**
   * @private
   * Gets migrations to run
   * @async
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Migrations to run
   */
  async #getMigrationsToRun(options) {
    const { target, only, skip } = options;
    const migrationsToRun = [];

    const sortedMigrations = Array.from(this.migrationRegistry.values())
      .sort((a, b) => a.version - b.version);

    for (const migration of sortedMigrations) {
      // Check if already applied
      if (this.appliedMigrations.has(migration.name)) {
        continue;
      }

      // Check target version
      if (target && migration.version > target) {
        break;
      }

      // Check only filter
      if (only.length > 0 && !only.includes(migration.name)) {
        continue;
      }

      // Check skip filter
      if (skip.includes(migration.name)) {
        continue;
      }

      migrationsToRun.push(migration);
    }

    return migrationsToRun;
  }

  /**
   * @private
   * Gets migrations to rollback
   * @async
   * @param {Object} options - Rollback options
   * @returns {Promise<Array>} Migrations to rollback
   */
  async #getMigrationsToRollback(options) {
    const { steps, target } = options;

    const appliedMigrations = Array.from(this.appliedMigrations.values())
      .sort((a, b) => b.version - a.version);

    const migrationsToRollback = [];

    if (target !== undefined) {
      // Rollback to specific version
      for (const applied of appliedMigrations) {
        if (applied.version <= target) {
          break;
        }

        const migration = this.migrationRegistry.get(applied.name);
        if (migration) {
          migrationsToRollback.push(migration);
        }
      }
    } else {
      // Rollback by steps
      const count = Math.min(steps, appliedMigrations.length);
      for (let i = 0; i < count; i++) {
        const applied = appliedMigrations[i];
        const migration = this.migrationRegistry.get(applied.name);
        if (migration) {
          migrationsToRollback.push(migration);
        }
      }
    }

    return migrationsToRollback;
  }

  /**
   * @private
   * Validates migrations
   * @async
   * @param {Array} migrations - Migrations to validate
   * @throws {AppError} If validation fails
   */
  async #validateMigrations(migrations) {
    for (const migration of migrations) {
      const applied = this.appliedMigrations.get(migration.name);
      
      if (applied && applied.checksum !== migration.checksum) {
        throw new AppError(
          `Checksum mismatch for migration: ${migration.name}`,
          400,
          'CHECKSUM_MISMATCH',
          {
            migration: migration.name,
            expected: applied.checksum,
            actual: migration.checksum
          }
        );
      }
    }
  }

  /**
   * @private
   * Executes a migration
   * @async
   * @param {Object} migration - Migration to execute
   * @param {Object} [transaction] - Transaction context
   */
  async #executeMigration(migration, transaction) {
    if (!migration.up || typeof migration.up !== 'function') {
      throw new AppError('Migration missing up function', 400, 'INVALID_MIGRATION');
    }

    logger.info('Executing migration', {
      name: migration.name,
      version: migration.version
    });

    if (this.options.dryRun) {
      logger.info('Dry run - would execute migration', {
        name: migration.name
      });
      return;
    }

    const context = {
      transaction,
      logger: logger.child({ migration: migration.name }),
      connection: ConnectionManager.getConnection(),
      version: migration.version
    };

    await migration.up(context);

    logger.info('Migration executed successfully', {
      name: migration.name,
      version: migration.version
    });
  }

  /**
   * @private
   * Rolls back a migration
   * @async
   * @param {Object} migration - Migration to rollback
   * @param {Object} [transaction] - Transaction context
   */
  async #rollbackMigration(migration, transaction) {
    if (!migration.down || typeof migration.down !== 'function') {
      throw new AppError('Migration missing down function', 400, 'NO_ROLLBACK_FUNCTION');
    }

    logger.info('Rolling back migration', {
      name: migration.name,
      version: migration.version
    });

    if (this.options.dryRun) {
      logger.info('Dry run - would rollback migration', {
        name: migration.name
      });
      return;
    }

    const context = {
      transaction,
      logger: logger.child({ migration: migration.name }),
      connection: ConnectionManager.getConnection(),
      version: migration.version
    };

    await migration.down(context);

    logger.info('Migration rolled back successfully', {
      name: migration.name,
      version: migration.version
    });
  }

  /**
   * @private
   * Records migration execution
   * @async
   * @param {Object} migration - Executed migration
   * @param {Object} [options={}] - Record options
   */
  async #recordMigration(migration, options = {}) {
    try {
      const connection = ConnectionManager.getConnection();
      
      const record = {
        name: migration.name,
        version: migration.version,
        fileName: migration.fileName,
        type: migration.type,
        checksum: migration.checksum,
        appliedAt: new Date(),
        duration: options.duration || null,
        fake: options.fake || false
      };

      await connection.db
        .collection(this.options.tableName)
        .insertOne(record);

      this.appliedMigrations.set(migration.name, record);

    } catch (error) {
      logger.error('Failed to record migration', error);
      throw error;
    }
  }

  /**
   * @private
   * Removes migration record
   * @async
   * @param {Object} migration - Migration to remove
   */
  async #removeMigrationRecord(migration) {
    try {
      const connection = ConnectionManager.getConnection();
      
      await connection.db
        .collection(this.options.tableName)
        .deleteOne({ name: migration.name });

      this.appliedMigrations.delete(migration.name);
      MigrationRunner.#migrationHistory.delete(migration.name);

    } catch (error) {
      logger.error('Failed to remove migration record', error);
      throw error;
    }
  }

  /**
   * @private
   * Acquires migration lock
   * @async
   */
  async #acquireLock() {
    const lockId = `migration_lock_${Date.now()}`;
    const startTime = Date.now();

    while (MigrationRunner.#migrationLock !== null) {
      if (Date.now() - startTime > this.options.lockTimeout) {
        throw new AppError(
          'Failed to acquire migration lock',
          408,
          'LOCK_TIMEOUT'
        );
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    MigrationRunner.#migrationLock = lockId;
    logger.debug('Migration lock acquired', { lockId });
  }

  /**
   * @private
   * Releases migration lock
   * @async
   */
  async #releaseLock() {
    if (MigrationRunner.#migrationLock) {
      const lockId = MigrationRunner.#migrationLock;
      MigrationRunner.#migrationLock = null;
      logger.debug('Migration lock released', { lockId });
    }
  }

  /**
   * @private
   * Completes migration run
   * @param {Object} context - Run context
   * @returns {Object} Run result
   */
  #completeRun(context) {
    context.endTime = Date.now();
    context.duration = context.endTime - context.startTime;

    MigrationRunner.#activeMigrations.delete(context.id);
    MigrationRunner.#migrationHistory.set(context.id, context);

    logger.info('Migration run completed', {
      runId: context.id,
      successful: context.successful,
      failed: context.failed,
      duration: context.duration
    });

    return {
      runId: context.id,
      state: context.state,
      successful: context.successful,
      failed: context.failed,
      skipped: context.skipped,
      duration: context.duration,
      migrations: context.migrations,
      errors: context.errors
    };
  }

  /**
   * @private
   * Generates unique run ID
   * @returns {string} Run ID
   */
  #generateRunId() {
    return `mig_run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Gets next version number
   * @async
   * @returns {Promise<number>} Next version
   */
  async #getNextVersion() {
    const migrations = Array.from(this.migrationRegistry.values());
    
    if (migrations.length === 0) {
      return 1;
    }

    const maxVersion = Math.max(...migrations.map(m => m.version));
    return maxVersion + 1;
  }

  /**
   * @private
   * Generates migration file content
   * @param {string} name - Migration name
   * @param {Object} options - Generation options
   * @returns {string} Migration content
   */
  #generateMigrationContent(name, options) {
    const { type, timestamp, version } = options;

    return `'use strict';

/**
 * @fileoverview ${name} migration
 * @version ${version}
 * @generated ${new Date(timestamp).toISOString()}
 */

module.exports = {
  type: '${type}',
  description: '${name} migration',
  transactional: true,

  /**
   * Run the migration
   * @param {Object} context - Migration context
   * @param {Object} [context.transaction] - Transaction context
   * @param {Object} context.logger - Logger instance
   * @param {Object} context.connection - Database connection
   * @param {number} context.version - Migration version
   */
  async up(context) {
    const { transaction, logger, connection, version } = context;
    
    logger.info('Running ${name} migration');
    
    // TODO: Implement migration logic
    
    logger.info('${name} migration completed');
  },

  /**
   * Rollback the migration
   * @param {Object} context - Migration context
   * @param {Object} [context.transaction] - Transaction context
   * @param {Object} context.logger - Logger instance
   * @param {Object} context.connection - Database connection
   * @param {number} context.version - Migration version
   */
  async down(context) {
    const { transaction, logger, connection, version } = context;
    
    logger.info('Rolling back ${name} migration');
    
    // TODO: Implement rollback logic
    
    logger.info('${name} migration rolled back');
  }
};
`;
  }

  /**
   * Clears migration runner data (for testing)
   * @static
   */
  static clearAll() {
    MigrationRunner.#migrationHistory.clear();
    MigrationRunner.#activeMigrations.clear();
    MigrationRunner.#migrationLock = null;
  }
}

module.exports = MigrationRunner;