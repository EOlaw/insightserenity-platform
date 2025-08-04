'use strict';

/**
 * @fileoverview Database seeding tool for populating initial data and test fixtures
 * @module tools/migration/seed
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/seeders/seed-manager
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/config
 * @requires path
 * @requires process
 */

const logger = require('../../shared/lib/utils/logger');
const { AppError } = require('../../shared/lib/utils/app-error');
const SeedManager = require('../../shared/lib/database/seeders/seed-manager');
const ConnectionManager = require('../../shared/lib/database/connection-manager');
const config = require('../../shared/config');
const path = require('path');

/**
 * @class SeedTool
 * @description Enterprise-grade database seeding tool with comprehensive data population
 * capabilities, supporting initial system data, test fixtures, and production data setup
 */
class SeedTool {
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
    static #SEEDER_CATEGORIES = ['initial', 'permissions', 'organizations', 'test', 'all'];

    /**
     * @private
     * @static
     * @readonly
     * @type {Object}
     */
    static #SEEDER_MAPPING = {
        initial: ['001-seed-initial-data'],
        permissions: ['004-seed-permissions'],
        organizations: ['003-seed-organizations'],
        test: ['005-seed-test-data'],
        all: ['001-seed-initial-data', '003-seed-organizations', '004-seed-permissions', '005-seed-test-data']
    };

    // ============================================================================
    // PUBLIC STATIC METHODS
    // ============================================================================

    /**
     * Initializes the seeding tool with database connections and configuration
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

            logger.info('Initializing seed tool', { environment, server, connectionName });

            // Store configuration
            SeedTool.#config = {
                environment,
                server,
                connectionName,
                seedersPath: path.join(__dirname, '../../shared/lib/database/seeders')
            };

            // Initialize database connections
            await SeedTool.#initializeConnections();

            // Initialize seed manager
            await SeedManager.initialize({
                connectionName,
                seedersPath: SeedTool.#config.seedersPath,
                environment: SeedTool.#config.environment,
                createCollections: true
            });

            SeedTool.#isInitialized = true;

            logger.info('Seed tool initialized successfully', {
                environment: SeedTool.#config.environment,
                seedersPath: SeedTool.#config.seedersPath
            });

        } catch (error) {
            logger.error('Seed tool initialization failed', error);
            throw new AppError(
                'Failed to initialize seed tool',
                500,
                'SEED_TOOL_INIT_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Executes database seeding based on specified options
     * @static
     * @async
     * @param {Object} [options={}] - Seeding execution options
     * @param {boolean} [options.fresh=false] - Drop collections before seeding
     * @param {boolean} [options.force=false] - Force re-run completed seeders
     * @param {Array<string>} [options.only] - Run only specific seeders
     * @param {Array<string>} [options.skip] - Skip specific seeders
     * @param {boolean} [options.testData=false] - Include test data seeders
     * @param {string} [options.category='all'] - Seeder category to run
     * @returns {Promise<Object>} Seeding execution results
     * @throws {AppError} If seeding execution fails
     */
    static async run(options = {}) {
        try {
            SeedTool.#ensureInitialized();

            const {
                fresh = false,
                force = false,
                only = [],
                skip = [],
                testData = SeedTool.#config.environment !== 'production',
                category = 'all'
            } = options;

            logger.info('Starting database seeding', { fresh, force, only, skip, testData, category });

            // Validate seeding options
            await SeedTool.#validateSeedingOptions(options);

            // Determine seeders to run based on category
            const seedersToRun = SeedTool.#determineSeedersToRun(category, only, testData);

            if (seedersToRun.length === 0) {
                logger.info('No seeders to run based on current options');
                return {
                    success: true,
                    seedersExecuted: 0,
                    message: 'No seeders matched the specified criteria'
                };
            }

            logger.info('Seeding plan determined', {
                seedersToRun: seedersToRun.length,
                seeders: seedersToRun
            });

            // Execute seeding
            const results = await SeedManager.seed({
                fresh,
                force,
                only: seedersToRun.length > 0 ? seedersToRun : only,
                skip,
                testData
            });

            // Log results
            if (results.success) {
                logger.info('Seeding execution completed successfully', {
                    seedersExecuted: results.seedersExecuted,
                    recordsCreated: results.totalRecords,
                    executionTime: results.executionTime
                });
            } else {
                logger.error('Seeding execution completed with errors', {
                    seedersExecuted: results.seedersExecuted,
                    errors: results.errors
                });
            }

            return results;

        } catch (error) {
            logger.error('Seeding execution failed', error);
            throw new AppError(
                'Database seeding failed',
                500,
                'SEEDING_EXECUTION_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Retrieves current seeding status and history
     * @static
     * @async
     * @returns {Promise<Object>} Seeding status information
     * @throws {AppError} If status retrieval fails
     */
    static async getStatus() {
        try {
            SeedTool.#ensureInitialized();

            logger.info('Retrieving seeding status');

            const status = await SeedManager.getStatus();

            logger.info('Seeding status retrieved', {
                totalSeeders: status.totalSeeders,
                completedSeeders: status.completedSeeders,
                pendingSeeders: status.pendingSeeders
            });

            return status;

        } catch (error) {
            logger.error('Failed to retrieve seeding status', error);
            throw new AppError(
                'Seeding status retrieval failed',
                500,
                'SEEDING_STATUS_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Resets database by dropping collections and re-seeding
     * @static
     * @async
     * @param {Object} [options={}] - Reset options
     * @returns {Promise<Object>} Reset execution results
     * @throws {AppError} If reset fails
     */
    static async reset(options = {}) {
        try {
            SeedTool.#ensureInitialized();

            logger.info('Starting database reset');

            // Safety check for production
            if (SeedTool.#config.environment === 'production' && !options.confirm) {
                throw new AppError(
                    'Database reset is not allowed in production without explicit confirmation',
                    400,
                    'PRODUCTION_RESET_DENIED'
                );
            }

            // Execute fresh seeding (which drops collections)
            const results = await SeedTool.run({
                ...options,
                fresh: true,
                force: true
            });

            logger.info('Database reset completed', {
                seedersExecuted: results.seedersExecuted,
                recordsCreated: results.totalRecords
            });

            return results;

        } catch (error) {
            logger.error('Database reset failed', error);
            throw new AppError(
                'Database reset failed',
                500,
                'DATABASE_RESET_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Parses command line arguments for seeding execution
     * @static
     * @param {Array<string>} args - Command line arguments
     * @returns {Object} Parsed options
     */
    static parseArguments(args) {
        const options = {
            fresh: false,
            force: false,
            only: [],
            skip: [],
            testData: process.env.NODE_ENV !== 'production',
            category: 'all',
            confirm: false,
            environment: process.env.NODE_ENV || 'development',
            server: 'shared'
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            switch (arg) {
                case '--fresh':
                    options.fresh = true;
                    break;
                case '--force':
                    options.force = true;
                    break;
                case '--confirm':
                    options.confirm = true;
                    break;
                case '--test-data':
                    options.testData = true;
                    break;
                case '--no-test-data':
                    options.testData = false;
                    break;
                case '--only':
                    options.only = args[++i]?.split(',') || [];
                    break;
                case '--skip':
                    options.skip = args[++i]?.split(',') || [];
                    break;
                case '--category':
                    options.category = args[++i] || 'all';
                    break;
                case '--server':
                    options.server = args[++i] || 'shared';
                    break;
                case '--environment':
                    options.environment = args[++i] || 'development';
                    break;
                case '--reset':
                    options.reset = true;
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
            logger.info('Performing seed tool cleanup');

            // Close database connections
            for (const [name, connection] of SeedTool.#connections) {
                try {
                    await connection.close();
                    logger.debug('Database connection closed', { connectionName: name });
                } catch (error) {
                    logger.warn('Error closing database connection', { connectionName: name, error: error.message });
                }
            }

            SeedTool.#connections.clear();
            SeedTool.#isInitialized = false;

            logger.info('Seed tool cleanup completed');

        } catch (error) {
            logger.error('Seed tool cleanup failed', error);
        }
    }

    // ============================================================================
    // PRIVATE STATIC METHODS
    // ============================================================================

    /**
     * Ensures the seed tool is properly initialized
     * @private
     * @static
     * @throws {AppError} If not initialized
     */
    static #ensureInitialized() {
        if (!SeedTool.#isInitialized) {
            throw new AppError(
                'Seed tool not initialized',
                500,
                'SEED_TOOL_NOT_INITIALIZED'
            );
        }
    }

    /**
     * @private
     * Initializes database connections for the seed tool
     * @static
     * @async
     * @returns {Promise<void>}
     * @throws {AppError} If connection initialization fails
     */
    static async #initializeConnections() {
        try {
            logger.info('Initializing database connections for seed tool');

            // Initialize main database connection - FIXED PARAMETER ORDER
            const mainConnection = await ConnectionManager.connect(
                SeedTool.#config.connectionName,
                {
                    uri: config.database.uri,
                    mongoOptions: config.database.options
                }
            );

            SeedTool.#connections.set(SeedTool.#config.connectionName, mainConnection);

            logger.info('Database connections initialized for seed tool', {
                connectionName: SeedTool.#config.connectionName
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
     * Validates seeding options for consistency and safety
     * @private
     * @static
     * @async
     * @param {Object} options - Seeding options to validate
     * @throws {AppError} If validation fails
     */
    static async #validateSeedingOptions(options) {
        const { category, only, testData } = options;

        // Validate category parameter
        if (category && !SeedTool.#SEEDER_CATEGORIES.includes(category)) {
            throw new AppError(
                `Invalid seeder category: ${category}. Must be one of: ${SeedTool.#SEEDER_CATEGORIES.join(', ')}`,
                400,
                'INVALID_SEEDER_CATEGORY'
            );
        }

        // Warn about test data in production
        if (SeedTool.#config.environment === 'production' && testData) {
            logger.warn('Test data seeding requested in production environment');
        }

        // Validate only parameter format
        if (only && !Array.isArray(only)) {
            throw new AppError(
                'Only parameter must be an array of seeder names',
                400,
                'INVALID_ONLY_PARAMETER'
            );
        }
    }

    /**
     * Determines which seeders to run based on category and options
     * @private
     * @static
     * @param {string} category - Seeder category
     * @param {Array<string>} only - Specific seeders to run
     * @param {boolean} testData - Include test data seeders
     * @returns {Array<string>} List of seeders to run
     */
    static #determineSeedersToRun(category, only, testData) {
        // If specific seeders are requested, use those
        if (only && only.length > 0) {
            return only;
        }

        // Get seeders for the specified category
        let seeders = SeedTool.#SEEDER_MAPPING[category] || [];

        // Filter out test data seeders if not requested
        if (!testData) {
            seeders = seeders.filter(seeder => !seeder.includes('test-data'));
        }

        return seeders;
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
        const options = SeedTool.parseArguments(args);

        // Initialize seed tool
        await SeedTool.initialize(options);

        let results;

        // Execute reset if requested
        if (options.reset) {
            results = await SeedTool.reset(options);
        } else {
            // Execute standard seeding
            results = await SeedTool.run(options);
        }

        // Display results
        if (results.success) {
            console.log('\n✅ Seeding completed successfully!');
            console.log(`📊 Seeders executed: ${results.seedersExecuted}`);
            console.log(`📝 Records created: ${results.totalRecords || 0}`);

            if (results.executionTime) {
                console.log(`⏱️  Execution time: ${results.executionTime}ms`);
            }

            if (results.seeders && results.seeders.length > 0) {
                console.log('\n📋 Executed seeders:');
                results.seeders.forEach((seeder, index) => {
                    console.log(`${index + 1}. ${seeder}`);
                });
            }
        } else {
            console.error('\n❌ Seeding completed with errors!');
            console.error(`📊 Seeders executed: ${results.seedersExecuted}`);

            if (results.errors && results.errors.length > 0) {
                console.error('\n🔥 Errors encountered:');
                results.errors.forEach((error, index) => {
                    console.error(`${index + 1}. ${error.seeder}: ${error.error}`);
                });
            }

            process.exit(1);
        }

    } catch (error) {
        console.error('\n💥 Seed tool execution failed:', error.message);
        logger.error('Seed tool execution failed', error);
        process.exit(1);
    } finally {
        // Cleanup resources
        await SeedTool.cleanup();
    }
}

// Execute if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error in seed tool:', error);
        process.exit(1);
    });
}

module.exports = SeedTool;