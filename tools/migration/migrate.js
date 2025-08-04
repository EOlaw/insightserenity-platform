'use strict';

/**
 * @fileoverview Database migration execution tool for schema and data migrations
 * @module tools/migration/migrate
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/migrations/migration-runner
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/config
 * @requires path
 * @requires process
 */

const logger = require('../../shared/lib/utils/logger');
const { AppError } = require('../../shared/lib/utils/app-error');
const MigrationRunner = require('../../shared/lib/database/migrations/migration-runner');
const ConnectionManager = require('../../shared/lib/database/connection-manager');
const config = require('../../shared/config');
const path = require('path');

/**
 * @class MigrationTool
 * @description Enterprise-grade migration execution tool with comprehensive error handling
 * and transaction support for database schema and data migrations
 */
class MigrationTool {
  // ============================================================================
  // PRIVATE STATIC FIELD DECLARATIONS
  // ============================================================================

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #config = null;

  /**
   * @private
   * @static
   * @readonly
   * @type {boolean}
   */
  static #isInitialized = false;

  /**
   * @private
   * @static
   * @readonly
   * @type {Map}
   */
  static #connections = new Map();

  // ============================================================================
  // PUBLIC STATIC METHODS
  // ============================================================================

  /**
   * Initializes the migration tool with database connections and configuration
   * @static
   * @async
   * @param {Object} [options={}] - Initialization options
   * @param {string} [options.environment] - Target environment
   * @param {string} [options.server] - Target server context
   * @param {string} [options.connectionName] - Database connection name
   * @returns {Promise<void>}
   * @throws {AppError} If initialization fails
   */
  static async initialize(options = {}) {
    try {
      const {
        environment = process.env.NODE_ENV || 'development',
        server = 'shared',
        connectionName = 'default'
      } = options;

      logger.info('Initializing migration tool', { environment, server, connectionName });

      // Store configuration
      MigrationTool.#config = {
        environment,
        server,
        connectionName,
        migrationsPath: path.join(__dirname, '../../shared/lib/database/migrations')
      };

      // Initialize database connections
      await MigrationTool.#initializeConnections();

      // Initialize migration runner
      await MigrationRunner.initialize({
        connectionName,
        migrationsPath: MigrationTool.#config.migrationsPath,
        createCollections: true
      });

      MigrationTool.#isInitialized = true;

      logger.info('Migration tool initialized successfully', {
        environment: MigrationTool.#config.environment,
        migrationsPath: MigrationTool.#config.migrationsPath
      });

    } catch (error) {
      logger.error('Migration tool initialization failed', error);
      throw new AppError(
        'Failed to initialize migration tool',
        500,
        'MIGRATION_TOOL_INIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Executes pending database migrations
   * @static
   * @async
   * @param {Object} [options={}] - Migration execution options
   * @param {boolean} [options.dryRun=false] - Simulate migration without executing
   * @param {Array<string>} [options.only] - Run only specific migrations
   * @param {Array<string>} [options.skip] - Skip specific migrations
   * @param {boolean} [options.force=false] - Force re-run completed migrations
   * @returns {Promise<Object>} Migration execution results
   * @throws {AppError} If migration execution fails
   */
  static async run(options = {}) {
    try {
      MigrationTool.#ensureInitialized();

      const {
        dryRun = false,
        only = [],
        skip = [],
        force = false
      } = options;

      logger.info('Starting database migration', { dryRun, only, skip, force });

      // Get migration status before execution
      const statusBefore = await MigrationRunner.getStatus();
      
      logger.info('Migration status assessment', {
        totalMigrations: statusBefore.totalMigrations,
        pendingMigrations: statusBefore.pendingMigrations,
        completedMigrations: statusBefore.completedMigrations
      });

      if (statusBefore.pendingMigrations === 0 && !force) {
        logger.info('No pending migrations found');
        return {
          success: true,
          migrationsExecuted: 0,
          message: 'Database is up to date'
        };
      }

      // Execute migrations
      const results = await MigrationRunner.run({
        dryRun,
        only,
        skip,
        force
      });

      // Log results
      if (results.success) {
        logger.info('Migration execution completed successfully', {
          migrationsExecuted: results.migrationsExecuted,
          executionTime: results.executionTime
        });
      } else {
        logger.error('Migration execution completed with errors', {
          migrationsExecuted: results.migrationsExecuted,
          errors: results.errors
        });
      }

      return results;

    } catch (error) {
      logger.error('Migration execution failed', error);
      throw new AppError(
        'Database migration failed',
        500,
        'MIGRATION_EXECUTION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Retrieves current migration status and history
   * @static
   * @async
   * @returns {Promise<Object>} Migration status information
   * @throws {AppError} If status retrieval fails
   */
  static async getStatus() {
    try {
      MigrationTool.#ensureInitialized();

      logger.info('Retrieving migration status');

      const status = await MigrationRunner.getStatus();

      logger.info('Migration status retrieved', {
        totalMigrations: status.totalMigrations,
        pendingMigrations: status.pendingMigrations,
        completedMigrations: status.completedMigrations
      });

      return status;

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
   * Parses command line arguments for migration execution
   * @static
   * @param {Array<string>} args - Command line arguments
   * @returns {Object} Parsed options
   */
  static parseArguments(args) {
    const options = {
      dryRun: false,
      only: [],
      skip: [],
      force: false,
      environment: process.env.NODE_ENV || 'development',
      server: 'shared'
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--dry-run':
          options.dryRun = true;
          break;
        case '--force':
          options.force = true;
          break;
        case '--only':
          options.only = args[++i]?.split(',') || [];
          break;
        case '--skip':
          options.skip = args[++i]?.split(',') || [];
          break;
        case '--server':
          options.server = args[++i] || 'shared';
          break;
        case '--environment':
          options.environment = args[++i] || 'development';
          break;
      }
    }

    return options;
  }

  /**
   * Closes database connections and performs cleanup
   * @static
   * @async
   * @returns {Promise<void>}
   */
  static async cleanup() {
    try {
      logger.info('Performing migration tool cleanup');

      // Close database connections
      for (const [name, connection] of MigrationTool.#connections) {
        try {
          await connection.close();
          logger.debug('Database connection closed', { connectionName: name });
        } catch (error) {
          logger.warn('Error closing database connection', { connectionName: name, error: error.message });
        }
      }

      MigrationTool.#connections.clear();
      MigrationTool.#isInitialized = false;

      logger.info('Migration tool cleanup completed');

    } catch (error) {
      logger.error('Migration tool cleanup failed', error);
    }
  }

  // ============================================================================
  // PRIVATE STATIC METHODS
  // ============================================================================

  /**
   * Ensures the migration tool is properly initialized
   * @private
   * @static
   * @throws {AppError} If not initialized
   */
  static #ensureInitialized() {
    if (!MigrationTool.#isInitialized) {
      throw new AppError(
        'Migration tool not initialized',
        500,
        'MIGRATION_TOOL_NOT_INITIALIZED'
      );
    }
  }

  /**
   * Initializes database connections for the migration tool
   * @private
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {AppError} If connection initialization fails
   */
  static async #initializeConnections() {
    try {
      logger.info('Initializing database connections for migration tool');

      // Initialize main database connection
      const mainConnection = await ConnectionManager.initialize({
        connectionName: MigrationTool.#config.connectionName,
        uri: config.database.uri,
        options: config.database.options
      });

      MigrationTool.#connections.set(MigrationTool.#config.connectionName, mainConnection);

      logger.info('Database connections initialized for migration tool', {
        connectionName: MigrationTool.#config.connectionName
      });

    } catch (error) {
      logger.error('Failed to initialize database connections', error);
      throw new AppError(
        'Database connection initialization failed',
        500,
        'DB_CONNECTION_INIT_ERROR',
        { originalError: error.message }
      );
    }
  }
}

// ============================================================================
// CLI EXECUTION
// ============================================================================

/**
 * Main execution function for CLI usage
 * @async
 * @returns {Promise<void>}
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const options = MigrationTool.parseArguments(args);

    // Initialize migration tool
    await MigrationTool.initialize(options);

    // Execute migrations
    const results = await MigrationTool.run(options);

    // Display results
    if (results.success) {
      console.log('\n✅ Migration completed successfully!');
      console.log(`📊 Migrations executed: ${results.migrationsExecuted}`);
      
      if (results.executionTime) {
        console.log(`⏱️  Execution time: ${results.executionTime}ms`);
      }
    } else {
      console.error('\n❌ Migration completed with errors!');
      console.error(`📊 Migrations executed: ${results.migrationsExecuted}`);
      
      if (results.errors && results.errors.length > 0) {
        console.error('\n🔥 Errors encountered:');
        results.errors.forEach((error, index) => {
          console.error(`${index + 1}. ${error.migration}: ${error.error}`);
        });
      }
      
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Migration tool execution failed:', error.message);
    logger.error('Migration tool execution failed', error);
    process.exit(1);
  } finally {
    // Cleanup resources
    await MigrationTool.cleanup();
  }
}

// Execute if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error in migration tool:', error);
    process.exit(1);
  });
}

module.exports = MigrationTool;