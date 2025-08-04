'use strict';

/**
 * @fileoverview Database migration rollback tool for reverting schema and data changes
 * @module tools/migration/rollback
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
 * @class RollbackTool
 * @description Enterprise-grade migration rollback tool with comprehensive error handling
 * and transaction support for safely reverting database changes
 */
class RollbackTool {
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

    /**
     * @private
     * @static
     * @readonly
     * @type {Array<string>}
     */
    static #SUPPORTED_ROLLBACK_STRATEGIES = ['steps', 'target', 'all'];

    // ============================================================================
    // PUBLIC STATIC METHODS
    // ============================================================================

    /**
     * Initializes the rollback tool with database connections and configuration
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

            logger.info('Initializing rollback tool', { environment, server, connectionName });

            // Store configuration
            RollbackTool.#config = {
                environment,
                server,
                connectionName,
                migrationsPath: path.join(__dirname, '../../shared/lib/database/migrations')
            };

            // Initialize database connections
            await RollbackTool.#initializeConnections();

            // Initialize migration runner
            await MigrationRunner.initialize({
                connectionName,
                migrationsPath: RollbackTool.#config.migrationsPath,
                createCollections: true
            });

            RollbackTool.#isInitialized = true;

            logger.info('Rollback tool initialized successfully', {
                environment: RollbackTool.#config.environment,
                migrationsPath: RollbackTool.#config.migrationsPath
            });

        } catch (error) {
            logger.error('Rollback tool initialization failed', error);
            throw new AppError(
                'Failed to initialize rollback tool',
                500,
                'ROLLBACK_TOOL_INIT_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Executes migration rollback based on specified strategy
     * @static
     * @async
     * @param {Object} [options={}] - Rollback execution options
     * @param {boolean} [options.dryRun=false] - Simulate rollback without executing
     * @param {number} [options.steps=1] - Number of migrations to rollback
     * @param {string} [options.target] - Target migration to rollback to
     * @param {boolean} [options.all=false] - Rollback all migrations
     * @param {boolean} [options.confirm=false] - Skip confirmation prompts
     * @returns {Promise<Object>} Rollback execution results
     * @throws {AppError} If rollback execution fails
     */
    static async run(options = {}) {
        try {
            RollbackTool.#ensureInitialized();

            const {
                dryRun = false,
                steps = 1,
                target,
                all = false,
                confirm = false
            } = options;

            logger.info('Starting database rollback', { dryRun, steps, target, all });

            // Validate rollback options
            await RollbackTool.#validateRollbackOptions(options);

            // Get migration status before rollback
            const statusBefore = await MigrationRunner.getStatus();

            logger.info('Migration status assessment', {
                totalMigrations: statusBefore.totalMigrations,
                completedMigrations: statusBefore.completedMigrations
            });

            if (statusBefore.completedMigrations === 0) {
                logger.info('No migrations to rollback');
                return {
                    success: true,
                    migrationsRolledBack: 0,
                    message: 'No migrations to rollback'
                };
            }

            // Safety confirmation for production environments
            if (RollbackTool.#config.environment === 'production' && !confirm && !dryRun) {
                await RollbackTool.#requestConfirmation(options);
            }

            // Determine rollback parameters
            const rollbackParams = RollbackTool.#buildRollbackParams(options);

            // Execute rollback
            const results = await MigrationRunner.rollback(rollbackParams);

            // Log results
            if (results.success) {
                logger.info('Rollback execution completed successfully', {
                    migrationsRolledBack: results.migrationsRolledBack,
                    executionTime: results.executionTime
                });
            } else {
                logger.error('Rollback execution completed with errors', {
                    migrationsRolledBack: results.migrationsRolledBack,
                    errors: results.errors
                });
            }

            return results;

        } catch (error) {
            logger.error('Rollback execution failed', error);
            throw new AppError(
                'Database rollback failed',
                500,
                'ROLLBACK_EXECUTION_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Retrieves rollback preview without executing changes
     * @static
     * @async
     * @param {Object} [options={}] - Preview options
     * @returns {Promise<Object>} Rollback preview information
     * @throws {AppError} If preview generation fails
     */
    static async preview(options = {}) {
        try {
            RollbackTool.#ensureInitialized();

            logger.info('Generating rollback preview');

            // Execute dry run to get preview
            const previewResults = await RollbackTool.run({
                ...options,
                dryRun: true
            });

            logger.info('Rollback preview generated', {
                migrationsToRollback: previewResults.migrationsRolledBack,
                affectedMigrations: previewResults.migrations?.length || 0
            });

            return previewResults;

        } catch (error) {
            logger.error('Failed to generate rollback preview', error);
            throw new AppError(
                'Rollback preview generation failed',
                500,
                'ROLLBACK_PREVIEW_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Parses command line arguments for rollback execution
     * @static
     * @param {Array<string>} args - Command line arguments
     * @returns {Object} Parsed options
     */
    static parseArguments(args) {
        const options = {
            dryRun: false,
            steps: 1,
            target: null,
            all: false,
            confirm: false,
            environment: process.env.NODE_ENV || 'development',
            server: 'shared'
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            switch (arg) {
                case '--dry-run':
                    options.dryRun = true;
                    break;
                case '--confirm':
                    options.confirm = true;
                    break;
                case '--all':
                    options.all = true;
                    break;
                case '--steps':
                    options.steps = parseInt(args[++i], 10) || 1;
                    break;
                case '--target':
                    options.target = args[++i];
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
            logger.info('Performing rollback tool cleanup');

            // Close database connections
            for (const [name, connection] of RollbackTool.#connections) {
                try {
                    await connection.close();
                    logger.debug('Database connection closed', { connectionName: name });
                } catch (error) {
                    logger.warn('Error closing database connection', { connectionName: name, error: error.message });
                }
            }

            RollbackTool.#connections.clear();
            RollbackTool.#isInitialized = false;

            logger.info('Rollback tool cleanup completed');

        } catch (error) {
            logger.error('Rollback tool cleanup failed', error);
        }
    }

    // ============================================================================
    // PRIVATE STATIC METHODS
    // ============================================================================

    /**
     * Ensures the rollback tool is properly initialized
     * @private
     * @static
     * @throws {AppError} If not initialized
     */
    static #ensureInitialized() {
        if (!RollbackTool.#isInitialized) {
            throw new AppError(
                'Rollback tool not initialized',
                500,
                'ROLLBACK_TOOL_NOT_INITIALIZED'
            );
        }
    }

    /**
     * @private
     * Initializes database connections for the rollback tool
     * @static
     * @async
     * @returns {Promise<void>}
     * @throws {AppError} If connection initialization fails
     */
    static async #initializeConnections() {
        try {
            logger.info('Initializing database connections for rollback tool');

            // Initialize main database connection - FIXED PARAMETER ORDER
            const mainConnection = await ConnectionManager.connect(
                RollbackTool.#config.connectionName,
                {
                    uri: config.database.uri,
                    mongoOptions: config.database.options
                }
            );

            RollbackTool.#connections.set(RollbackTool.#config.connectionName, mainConnection);

            logger.info('Database connections initialized for rollback tool', {
                connectionName: RollbackTool.#config.connectionName
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

    /**
     * Validates rollback options for consistency and safety
     * @private
     * @static
     * @async
     * @param {Object} options - Rollback options to validate
     * @throws {AppError} If validation fails
     */
    static async #validateRollbackOptions(options) {
        const { steps, target, all } = options;

        // Ensure only one rollback strategy is specified
        const strategiesSpecified = [
            steps && steps > 0,
            Boolean(target),
            Boolean(all)
        ].filter(Boolean).length;

        if (strategiesSpecified > 1) {
            throw new AppError(
                'Only one rollback strategy can be specified: steps, target, or all',
                400,
                'INVALID_ROLLBACK_OPTIONS'
            );
        }

        // Validate steps parameter
        if (steps !== undefined && (!Number.isInteger(steps) || steps < 1)) {
            throw new AppError(
                'Steps parameter must be a positive integer',
                400,
                'INVALID_STEPS_PARAMETER'
            );
        }

        // Validate target parameter format if specified
        if (target && typeof target !== 'string') {
            throw new AppError(
                'Target parameter must be a string migration name',
                400,
                'INVALID_TARGET_PARAMETER'
            );
        }
    }

    /**
     * Builds rollback parameters from options
     * @private
     * @static
     * @param {Object} options - Original options
     * @returns {Object} Formatted rollback parameters
     */
    static #buildRollbackParams(options) {
        const { dryRun, steps, target, all } = options;

        const params = { dryRun };

        if (all) {
            // Rollback all migrations - set steps to a high number
            params.steps = Number.MAX_SAFE_INTEGER;
        } else if (target) {
            // Rollback to specific target
            params.to = target;
        } else {
            // Rollback specific number of steps
            params.steps = steps || 1;
        }

        return params;
    }

    /**
     * Requests user confirmation for destructive operations
     * @private
     * @static
     * @async
     * @param {Object} options - Rollback options
     * @throws {AppError} If user cancels operation
     */
    static async #requestConfirmation(options) {
        const { steps, target, all } = options;

        let confirmationMessage = 'You are about to rollback database migrations in PRODUCTION environment.\n';

        if (all) {
            confirmationMessage += 'This will rollback ALL migrations and may result in data loss!';
        } else if (target) {
            confirmationMessage += `This will rollback to migration target: ${target}`;
        } else {
            confirmationMessage += `This will rollback ${steps} migration(s)`;
        }

        confirmationMessage += '\n\nAre you sure you want to continue? (type "YES" to confirm): ';

        // In a real implementation, you would use readline or similar for user input
        // For this example, we'll throw an error requiring explicit confirmation
        throw new AppError(
            'Production rollback requires explicit confirmation. Use --confirm flag to proceed.',
            400,
            'CONFIRMATION_REQUIRED'
        );
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
        const options = RollbackTool.parseArguments(args);

        // Initialize rollback tool
        await RollbackTool.initialize(options);

        // Execute rollback
        const results = await RollbackTool.run(options);

        // Display results
        if (results.success) {
            console.log('\n✅ Rollback completed successfully!');
            console.log(`📊 Migrations rolled back: ${results.migrationsRolledBack}`);

            if (results.executionTime) {
                console.log(`⏱️  Execution time: ${results.executionTime}ms`);
            }

            if (results.migrations && results.migrations.length > 0) {
                console.log('\n📋 Affected migrations:');
                results.migrations.forEach((migration, index) => {
                    console.log(`${index + 1}. ${migration}`);
                });
            }
        } else {
            console.error('\n❌ Rollback completed with errors!');
            console.error(`📊 Migrations rolled back: ${results.migrationsRolledBack}`);

            if (results.errors && results.errors.length > 0) {
                console.error('\n🔥 Errors encountered:');
                results.errors.forEach((error, index) => {
                    console.error(`${index + 1}. ${error.migration}: ${error.error}`);
                });
            }

            process.exit(1);
        }

    } catch (error) {
        console.error('\n💥 Rollback tool execution failed:', error.message);
        logger.error('Rollback tool execution failed', error);
        process.exit(1);
    } finally {
        // Cleanup resources
        await RollbackTool.cleanup();
    }
}

// Execute if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error in rollback tool:', error);
        process.exit(1);
    });
}

module.exports = RollbackTool;