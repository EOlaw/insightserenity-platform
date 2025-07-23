'use strict';

/**
 * @fileoverview Database seed management with versioning and rollback support
 * @module shared/lib/database/seeders/seed-manager
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/database/transaction-manager
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires fs/promises
 * @requires path
 */

const fs = require('fs/promises');
const path = require('path');
const ConnectionManager = require('../connection-manager');
const TransactionManager = require('../transaction-manager');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');

/**
 * @class SeedManager
 * @description Manages database seeding operations with versioning and rollback
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
    ROLLED_BACK: 'rolled-back'
  };

  static #SEED_TYPES = {
    INITIAL: 'initial',
    DEVELOPMENT: 'development',
    TEST: 'test',
    DEMO: 'demo',
    PRODUCTION: 'production'
  };

  static #DEFAULT_OPTIONS = {
    seedsPath: './seeders',
    pattern: /^\d{3}-.*\.js$/,
    transactional: true,
    continueOnError: false,
    dryRun: false,
    parallel: false,
    maxParallel: 5
  };

  static #seedHistory = new Map();
  static #activeSeedRuns = new Map();

  /**
   * Creates an instance of SeedManager
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.seedsPath] - Path to seed files
   * @param {RegExp} [options.pattern] - Seed file pattern
   * @param {boolean} [options.transactional=true] - Use transactions
   * @param {boolean} [options.continueOnError=false] - Continue on seed failure
   * @param {Object} [options.transactionManager] - Transaction manager instance
   */
  constructor(options = {}) {
    this.options = {
      ...SeedManager.#DEFAULT_OPTIONS,
      ...options
    };

    this.transactionManager = options.transactionManager || new TransactionManager();
    this.seedsPath = path.resolve(this.options.seedsPath);
    this.executedSeeds = new Set();
    this.seedRegistry = new Map();
  }

  /**
   * Initializes seed manager
   * @async
   * @param {Object} [options={}] - Initialization options
   * @returns {Promise<void>}
   * @throws {AppError} If initialization fails
   */
  async initialize(options = {}) {
    try {
      // Ensure seeds directory exists
      await fs.mkdir(this.seedsPath, { recursive: true });

      // Load seed history from database
      await this.#loadSeedHistory();

      // Discover available seeds
      await this.#discoverSeeds();

      logger.info('SeedManager initialized', {
        seedsPath: this.seedsPath,
        discoveredSeeds: this.seedRegistry.size
      });

    } catch (error) {
      logger.error('Failed to initialize SeedManager', error);

      throw new AppError(
        'SeedManager initialization failed',
        500,
        'SEED_INIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Runs database seeds
   * @async
   * @param {Object} [options={}] - Seed options
   * @param {string} [options.type] - Seed type to run
   * @param {Array<string>} [options.only] - Only run specific seeds
   * @param {Array<string>} [options.skip] - Skip specific seeds
   * @param {boolean} [options.fresh=false] - Run all seeds fresh
   * @param {Object} [options.data={}] - Additional data for seeds
   * @returns {Promise<Object>} Seed run result
   * @throws {AppError} If seeding fails
   */
  async seed(options = {}) {
    const runId = this.#generateRunId();
    const startTime = Date.now();

    try {
      const {
        type = SeedManager.#SEED_TYPES.DEVELOPMENT,
        only = [],
        skip = [],
        fresh = false,
        data = {}
      } = options;

      logger.info('Starting seed run', {
        runId,
        type,
        fresh,
        seedCount: this.seedRegistry.size
      });

      // Initialize run context
      const runContext = {
        id: runId,
        type,
        state: SeedManager.#SEED_STATES.RUNNING,
        startTime,
        seeds: [],
        successful: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        options
      };

      SeedManager.#activeSeedRuns.set(runId, runContext);

      // Get seeds to run
      const seedsToRun = await this.#getSeeedsToRun({
        type,
        only,
        skip,
        fresh
      });

      if (seedsToRun.length === 0) {
        logger.info('No seeds to run');
        runContext.state = SeedManager.#SEED_STATES.COMPLETED;
        return this.#completeRun(runContext);
      }

      // Execute seeds
      if (this.options.parallel && !this.options.transactional) {
        await this.#runSeedsParallel(seedsToRun, runContext, data);
      } else {
        await this.#runSeedsSequential(seedsToRun, runContext, data);
      }

      // Complete run
      runContext.state = SeedManager.#SEED_STATES.COMPLETED;
      return this.#completeRun(runContext);

    } catch (error) {
      logger.error('Seed run failed', error);

      const runContext = SeedManager.#activeSeedRuns.get(runId);
      if (runContext) {
        runContext.state = SeedManager.#SEED_STATES.FAILED;
        runContext.error = error.message;
        this.#completeRun(runContext);
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Seed run failed',
        500,
        'SEED_RUN_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Rolls back seeds
   * @async
   * @param {Object} [options={}] - Rollback options
   * @param {number} [options.steps=1] - Number of seeds to rollback
   * @param {string} [options.to] - Rollback to specific seed
   * @param {boolean} [options.all=false] - Rollback all seeds
   * @returns {Promise<Object>} Rollback result
   * @throws {AppError} If rollback fails
   */
  async rollback(options = {}) {
    try {
      const {
        steps = 1,
        to,
        all = false
      } = options;

      logger.info('Starting seed rollback', options);

      const seedsToRollback = await this.#getSeedsToRollback({
        steps,
        to,
        all
      });

      if (seedsToRollback.length === 0) {
        logger.info('No seeds to rollback');
        return {
          rolledBack: 0,
          seeds: []
        };
      }

      const results = {
        rolledBack: 0,
        failed: 0,
        seeds: []
      };

      // Rollback in reverse order
      for (const seedName of seedsToRollback.reverse()) {
        try {
          await this.#rollbackSeed(seedName);
          results.rolledBack++;
          results.seeds.push({
            name: seedName,
            status: 'rolled-back'
          });
        } catch (error) {
          results.failed++;
          results.seeds.push({
            name: seedName,
            status: 'failed',
            error: error.message
          });

          if (!this.options.continueOnError) {
            throw error;
          }
        }
      }

      logger.info('Seed rollback completed', {
        rolledBack: results.rolledBack,
        failed: results.failed
      });

      return results;

    } catch (error) {
      logger.error('Seed rollback failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Seed rollback failed',
        500,
        'SEED_ROLLBACK_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets seed status
   * @async
   * @param {Object} [options={}] - Status options
   * @returns {Promise<Object>} Seed status
   */
  async status(options = {}) {
    try {
      const executed = await this.#getExecutedSeeds();
      const pending = [];
      const available = Array.from(this.seedRegistry.keys()).sort();

      for (const seedName of available) {
        if (!executed.has(seedName)) {
          pending.push(seedName);
        }
      }

      const lastRun = await this.#getLastSeedRun();

      return {
        executed: Array.from(executed).sort(),
        pending: pending.sort(),
        total: available.length,
        lastRun
      };

    } catch (error) {
      logger.error('Failed to get seed status', error);

      throw new AppError(
        'Failed to get seed status',
        500,
        'SEED_STATUS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates a new seed file
   * @async
   * @param {string} name - Seed name
   * @param {Object} [options={}] - Creation options
   * @returns {Promise<Object>} Created seed info
   * @throws {AppError} If creation fails
   */
  async create(name, options = {}) {
    try {
      if (!name) {
        throw new AppError('Seed name is required', 400, 'MISSING_SEED_NAME');
      }

      const {
        type = SeedManager.#SEED_TYPES.DEVELOPMENT,
        template = 'default'
      } = options;

      // Generate filename
      const timestamp = Date.now();
      const sequence = await this.#getNextSequence();
      const fileName = `${sequence.toString().padStart(3, '0')}-${name}.js`;
      const filePath = path.join(this.seedsPath, fileName);

      // Check if file exists
      try {
        await fs.access(filePath);
        throw new AppError('Seed file already exists', 409, 'SEED_EXISTS');
      } catch (error) {
        // File doesn't exist, continue
      }

      // Generate seed content
      const content = this.#generateSeedContent(name, {
        type,
        template,
        timestamp
      });

      // Write seed file
      await fs.writeFile(filePath, content, 'utf8');

      logger.info('Seed file created', {
        fileName,
        name,
        type
      });

      return {
        fileName,
        filePath,
        name,
        type,
        timestamp
      };

    } catch (error) {
      logger.error('Failed to create seed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Seed creation failed',
        500,
        'SEED_CREATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Lists available seeds
   * @async
   * @param {Object} [options={}] - List options
   * @returns {Promise<Array>} List of seeds
   */
  async list(options = {}) {
    try {
      const {
        type,
        executed,
        pending
      } = options;

      await this.#discoverSeeds();

      let seeds = Array.from(this.seedRegistry.values());

      // Filter by type
      if (type) {
        seeds = seeds.filter(seed => seed.type === type);
      }

      // Filter by execution status
      const executedSeeds = await this.#getExecutedSeeds();
      
      if (executed === true) {
        seeds = seeds.filter(seed => executedSeeds.has(seed.name));
      } else if (executed === false || pending === true) {
        seeds = seeds.filter(seed => !executedSeeds.has(seed.name));
      }

      // Add execution info
      const seedsWithInfo = seeds.map(seed => ({
        ...seed,
        executed: executedSeeds.has(seed.name),
        executedAt: executedSeeds.get(seed.name)?.executedAt || null
      }));

      return seedsWithInfo.sort((a, b) => a.sequence - b.sequence);

    } catch (error) {
      logger.error('Failed to list seeds', error);

      throw new AppError(
        'Failed to list seeds',
        500,
        'SEED_LIST_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Loads seed history from database
   * @async
   */
  async #loadSeedHistory() {
    try {
      const connection = ConnectionManager.getConnection();
      
      if (!connection) {
        logger.warn('No database connection, skipping seed history load');
        return;
      }

      const SeedModel = require('../models/seed-model');
      const history = await SeedModel.find().sort({ sequence: 1 });

      history.forEach(record => {
        this.executedSeeds.add(record.name);
        SeedManager.#seedHistory.set(record.name, record);
      });

      logger.info('Seed history loaded', {
        executedCount: this.executedSeeds.size
      });

    } catch (error) {
      logger.warn('Failed to load seed history', error);
    }
  }

  /**
   * @private
   * Discovers available seed files
   * @async
   */
  async #discoverSeeds() {
    try {
      const files = await fs.readdir(this.seedsPath);
      const seedFiles = files.filter(file => this.options.pattern.test(file));

      this.seedRegistry.clear();

      for (const file of seedFiles) {
        const filePath = path.join(this.seedsPath, file);
        const seed = await this.#loadSeed(filePath);
        
        if (seed) {
          this.seedRegistry.set(seed.name, seed);
        }
      }

      logger.debug('Seeds discovered', {
        count: this.seedRegistry.size
      });

    } catch (error) {
      logger.error('Failed to discover seeds', error);
    }
  }

  /**
   * @private
   * Loads a seed file
   * @async
   * @param {string} filePath - Seed file path
   * @returns {Promise<Object|null>} Seed info
   */
  async #loadSeed(filePath) {
    try {
      // Clear from require cache for fresh load
      delete require.cache[require.resolve(filePath)];
      
      const seedModule = require(filePath);
      const fileName = path.basename(filePath);
      const match = fileName.match(/^(\d{3})-(.*)\.js$/);

      if (!match) {
        logger.warn('Invalid seed filename', { fileName });
        return null;
      }

      const [, sequence, name] = match;

      return {
        name,
        fileName,
        filePath,
        sequence: parseInt(sequence, 10),
        type: seedModule.type || SeedManager.#SEED_TYPES.DEVELOPMENT,
        description: seedModule.description || '',
        up: seedModule.up,
        down: seedModule.down,
        dependencies: seedModule.dependencies || []
      };

    } catch (error) {
      logger.error('Failed to load seed', {
        filePath,
        error: error.message
      });
      return null;
    }
  }

  /**
   * @private
   * Gets seeds to run based on options
   * @async
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Seeds to run
   */
  async #getSeeedsToRun(options) {
    const { type, only, skip, fresh } = options;
    const executedSeeds = fresh ? new Set() : await this.#getExecutedSeeds();
    const seedsToRun = [];

    for (const [name, seed] of this.seedRegistry) {
      // Check if already executed
      if (!fresh && executedSeeds.has(name)) {
        continue;
      }

      // Check type filter
      if (type && seed.type !== type) {
        continue;
      }

      // Check only filter
      if (only.length > 0 && !only.includes(name)) {
        continue;
      }

      // Check skip filter
      if (skip.includes(name)) {
        continue;
      }

      seedsToRun.push(seed);
    }

    // Sort by sequence
    return seedsToRun.sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * @private
   * Runs seeds sequentially
   * @async
   * @param {Array} seeds - Seeds to run
   * @param {Object} context - Run context
   * @param {Object} data - Seed data
   */
  async #runSeedsSequential(seeds, context, data) {
    for (const seed of seeds) {
      const seedContext = {
        name: seed.name,
        startTime: Date.now(),
        state: SeedManager.#SEED_STATES.PENDING
      };

      context.seeds.push(seedContext);

      try {
        if (this.options.transactional) {
          await this.transactionManager.withTransaction(async (txn) => {
            await this.#executeSeed(seed, data, txn);
          });
        } else {
          await this.#executeSeed(seed, data);
        }

        seedContext.state = SeedManager.#SEED_STATES.COMPLETED;
        seedContext.endTime = Date.now();
        seedContext.duration = seedContext.endTime - seedContext.startTime;
        context.successful++;

        // Record execution
        await this.#recordSeedExecution(seed);

      } catch (error) {
        seedContext.state = SeedManager.#SEED_STATES.FAILED;
        seedContext.endTime = Date.now();
        seedContext.duration = seedContext.endTime - seedContext.startTime;
        seedContext.error = error.message;
        context.failed++;
        context.errors.push({
          seed: seed.name,
          error: error.message
        });

        logger.error('Seed execution failed', {
          seed: seed.name,
          error: error.message
        });

        if (!this.options.continueOnError) {
          throw error;
        }
      }
    }
  }

  /**
   * @private
   * Runs seeds in parallel
   * @async
   * @param {Array} seeds - Seeds to run
   * @param {Object} context - Run context
   * @param {Object} data - Seed data
   */
  async #runSeedsParallel(seeds, context, data) {
    const chunks = this.#chunkArray(seeds, this.options.maxParallel);

    for (const chunk of chunks) {
      const promises = chunk.map(async (seed) => {
        const seedContext = {
          name: seed.name,
          startTime: Date.now(),
          state: SeedManager.#SEED_STATES.PENDING
        };

        context.seeds.push(seedContext);

        try {
          await this.#executeSeed(seed, data);

          seedContext.state = SeedManager.#SEED_STATES.COMPLETED;
          seedContext.endTime = Date.now();
          seedContext.duration = seedContext.endTime - seedContext.startTime;
          context.successful++;

          await this.#recordSeedExecution(seed);

        } catch (error) {
          seedContext.state = SeedManager.#SEED_STATES.FAILED;
          seedContext.endTime = Date.now();
          seedContext.duration = seedContext.endTime - seedContext.startTime;
          seedContext.error = error.message;
          context.failed++;
          context.errors.push({
            seed: seed.name,
            error: error.message
          });

          if (!this.options.continueOnError) {
            throw error;
          }
        }
      });

      await Promise.all(promises);
    }
  }

  /**
   * @private
   * Executes a single seed
   * @async
   * @param {Object} seed - Seed to execute
   * @param {Object} data - Seed data
   * @param {Object} [transaction] - Transaction context
   */
  async #executeSeed(seed, data, transaction) {
    if (!seed.up || typeof seed.up !== 'function') {
      throw new AppError('Seed missing up function', 400, 'INVALID_SEED');
    }

    logger.info('Executing seed', { name: seed.name });

    // Check dependencies
    if (seed.dependencies.length > 0) {
      await this.#checkDependencies(seed.dependencies);
    }

    // Execute seed
    if (this.options.dryRun) {
      logger.info('Dry run - would execute seed', { name: seed.name });
      return;
    }

    const context = {
      data,
      transaction,
      logger: logger.child({ seed: seed.name })
    };

    await seed.up(context);

    logger.info('Seed executed successfully', { name: seed.name });
  }

  /**
   * @private
   * Rolls back a single seed
   * @async
   * @param {string} seedName - Seed name to rollback
   */
  async #rollbackSeed(seedName) {
    const seed = this.seedRegistry.get(seedName);
    
    if (!seed) {
      throw new AppError('Seed not found', 404, 'SEED_NOT_FOUND');
    }

    if (!seed.down || typeof seed.down !== 'function') {
      throw new AppError('Seed missing down function', 400, 'NO_ROLLBACK_FUNCTION');
    }

    logger.info('Rolling back seed', { name: seedName });

    if (this.options.dryRun) {
      logger.info('Dry run - would rollback seed', { name: seedName });
      return;
    }

    const context = {
      logger: logger.child({ seed: seedName })
    };

    if (this.options.transactional) {
      await this.transactionManager.withTransaction(async (txn) => {
        context.transaction = txn;
        await seed.down(context);
      });
    } else {
      await seed.down(context);
    }

    // Remove from executed seeds
    await this.#removeSeedExecution(seedName);

    logger.info('Seed rolled back successfully', { name: seedName });
  }

  /**
   * @private
   * Records seed execution
   * @async
   * @param {Object} seed - Executed seed
   */
  async #recordSeedExecution(seed) {
    try {
      const SeedModel = require('../models/seed-model');
      
      await SeedModel.create({
        name: seed.name,
        fileName: seed.fileName,
        sequence: seed.sequence,
        type: seed.type,
        executedAt: new Date(),
        version: 1
      });

      this.executedSeeds.add(seed.name);

    } catch (error) {
      logger.error('Failed to record seed execution', error);
    }
  }

  /**
   * @private
   * Removes seed execution record
   * @async
   * @param {string} seedName - Seed name
   */
  async #removeSeedExecution(seedName) {
    try {
      const SeedModel = require('../models/seed-model');
      
      await SeedModel.deleteOne({ name: seedName });
      this.executedSeeds.delete(seedName);
      SeedManager.#seedHistory.delete(seedName);

    } catch (error) {
      logger.error('Failed to remove seed execution record', error);
    }
  }

  /**
   * @private
   * Gets executed seeds
   * @async
   * @returns {Promise<Set>} Executed seed names
   */
  async #getExecutedSeeds() {
    if (this.executedSeeds.size === 0) {
      await this.#loadSeedHistory();
    }
    return new Set(this.executedSeeds);
  }

  /**
   * @private
   * Gets seeds to rollback
   * @async
   * @param {Object} options - Rollback options
   * @returns {Promise<Array>} Seeds to rollback
   */
  async #getSeedsToRollback(options) {
    const executed = Array.from(await this.#getExecutedSeeds()).sort();

    if (options.all) {
      return executed;
    }

    if (options.to) {
      const index = executed.indexOf(options.to);
      if (index === -1) {
        throw new AppError('Target seed not found', 404, 'SEED_NOT_FOUND');
      }
      return executed.slice(index);
    }

    return executed.slice(-options.steps);
  }

  /**
   * @private
   * Checks seed dependencies
   * @async
   * @param {Array} dependencies - Required dependencies
   */
  async #checkDependencies(dependencies) {
    const executed = await this.#getExecutedSeeds();

    for (const dep of dependencies) {
      if (!executed.has(dep)) {
        throw new AppError(
          `Missing dependency: ${dep}`,
          400,
          'MISSING_DEPENDENCY'
        );
      }
    }
  }

  /**
   * @private
   * Gets last seed run info
   * @async
   * @returns {Promise<Object|null>} Last run info
   */
  async #getLastSeedRun() {
    const history = Array.from(SeedManager.#seedHistory.values());
    
    if (history.length === 0) {
      return null;
    }

    const lastSeed = history.sort((a, b) => 
      new Date(b.executedAt) - new Date(a.executedAt)
    )[0];

    return {
      name: lastSeed.name,
      executedAt: lastSeed.executedAt,
      sequence: lastSeed.sequence
    };
  }

  /**
   * @private
   * Completes seed run
   * @param {Object} context - Run context
   * @returns {Object} Run result
   */
  #completeRun(context) {
    context.endTime = Date.now();
    context.duration = context.endTime - context.startTime;

    SeedManager.#activeSeedRuns.delete(context.id);
    SeedManager.#seedHistory.set(context.id, context);

    logger.info('Seed run completed', {
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
      seeds: context.seeds,
      errors: context.errors
    };
  }

  /**
   * @private
   * Generates unique run ID
   * @returns {string} Run ID
   */
  #generateRunId() {
    return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Gets next sequence number
   * @async
   * @returns {Promise<number>} Next sequence
   */
  async #getNextSequence() {
    const seeds = Array.from(this.seedRegistry.values());
    
    if (seeds.length === 0) {
      return 1;
    }

    const maxSequence = Math.max(...seeds.map(s => s.sequence));
    return maxSequence + 1;
  }

  /**
   * @private
   * Generates seed file content
   * @param {string} name - Seed name
   * @param {Object} options - Generation options
   * @returns {string} Seed content
   */
  #generateSeedContent(name, options) {
    const { type, timestamp } = options;

    return `'use strict';

/**
 * @fileoverview ${name} seed
 * @generated ${new Date(timestamp).toISOString()}
 */

module.exports = {
  type: '${type}',
  description: '${name} seed',
  dependencies: [],

  /**
   * Run the seed
   * @param {Object} context - Seed context
   * @param {Object} context.data - Seed data
   * @param {Object} [context.transaction] - Transaction context
   * @param {Object} context.logger - Logger instance
   */
  async up(context) {
    const { data, transaction, logger } = context;
    
    logger.info('Running ${name} seed');
    
    // TODO: Implement seed logic
    
    logger.info('${name} seed completed');
  },

  /**
   * Rollback the seed
   * @param {Object} context - Seed context
   * @param {Object} [context.transaction] - Transaction context
   * @param {Object} context.logger - Logger instance
   */
  async down(context) {
    const { transaction, logger } = context;
    
    logger.info('Rolling back ${name} seed');
    
    // TODO: Implement rollback logic
    
    logger.info('${name} seed rolled back');
  }
};
`;
  }

  /**
   * @private
   * Chunks array into smaller arrays
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array<Array>} Chunked arrays
   */
  #chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Clears seed manager data (for testing)
   * @static
   */
  static clearAll() {
    SeedManager.#seedHistory.clear();
    SeedManager.#activeSeedRuns.clear();
  }
}

module.exports = SeedManager;