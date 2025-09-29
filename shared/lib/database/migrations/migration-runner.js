/**
 * @fileoverview MigrationRunner - Manages database migrations across multiple databases
 * @module shared/lib/database/migrations/migration-runner
 * @requires fs
 * @requires path
 * @requires crypto
 * @requires winston
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const winston = require('winston');
const { EventEmitter } = require('events');
const glob = require('glob');
const { promisify } = require('util');

const globAsync = promisify(glob);

/**
 * @class MigrationRunner
 * @extends EventEmitter
 * @description Handles database migrations with support for multiple databases,
 * rollback capabilities, and comprehensive tracking
 */
class MigrationRunner extends EventEmitter {
    /**
     * Creates an instance of MigrationRunner
     * @param {Object} options - Configuration options
     * @param {ConnectionManager} options.connectionManager - Connection manager instance
     * @param {winston.Logger} options.logger - Logger instance
     * @param {Object} options.config - Migration configuration
     */
    constructor(options = {}) {
        super();

        // Validate required dependencies
        if (!options.connectionManager) {
            throw new Error('ConnectionManager instance is required');
        }

        this.connectionManager = options.connectionManager;
        this.logger = options.logger || this._createDefaultLogger();

        // Migration configuration
        this.config = {
            migrationsPath: options.config?.migrationsPath || path.join(process.cwd(), 'shared/lib/database/migrations'),
            migrationsPattern: options.config?.migrationsPattern || '*.migration.js',
            migrationsTable: options.config?.migrationsTable || '_migrations',
            lockTimeout: options.config?.lockTimeout || 60000,
            batchSize: options.config?.batchSize || 10,
            validateBeforeRun: options.config?.validateBeforeRun !== false,
            dryRun: options.config?.dryRun || false,
            continueOnError: options.config?.continueOnError || false,
            databases: options.config?.databases || ['admin', 'customer'],
            ...options.config
        };

        // Migration state
        this.state = {
            isRunning: false,
            currentMigration: null,
            completedMigrations: new Map(),
            pendingMigrations: new Map(),
            failedMigrations: new Map(),
            locks: new Map()
        };

        // Migration history
        this.history = {
            runs: [],
            rollbacks: [],
            errors: []
        };

        // Performance metrics
        this.metrics = {
            totalRuns: 0,
            totalRollbacks: 0,
            totalFailures: 0,
            averageRunTime: 0,
            runTimes: []
        };

        // Migration schemas cache
        this.migrationSchemas = new Map();

        // Initialize migration tracking collections
        this._initializeMigrationCollections();

        this.logger.info('MigrationRunner initialized', {
            migrationsPath: this.config.migrationsPath,
            databases: this.config.databases
        });
    }

    /**
     * Creates a default Winston logger
     * @private
     * @returns {winston.Logger} Logger instance
     */
    _createDefaultLogger() {
        return winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'migration-runner' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
    }

    /**
     * Initializes migration tracking collections
     * @private
     */
    async _initializeMigrationCollections() {
        for (const dbName of this.config.databases) {
            try {
                const db = this.connectionManager.getDatabase(dbName);
                if (!db) {
                    this.logger.warn(`Database ${dbName} not available for migrations`);
                    continue;
                }

                // Create migrations collection if it doesn't exist
                const collections = await db.db.listCollections({ name: this.config.migrationsTable }).toArray();

                if (collections.length === 0) {
                    await db.db.createCollection(this.config.migrationsTable);

                    // Create indexes for migration tracking
                    const collection = db.db.collection(this.config.migrationsTable);
                    await collection.createIndex({ name: 1 }, { unique: true });
                    await collection.createIndex({ batch: 1 });
                    await collection.createIndex({ appliedAt: -1 });
                    await collection.createIndex({ status: 1 });

                    this.logger.info(`Created migrations collection for ${dbName}`);
                }

            } catch (error) {
                this.logger.error(`Failed to initialize migration collection for ${dbName}`, {
                    error: error.message
                });
            }
        }
    }

    /**
     * Discovers all migration files
     * @returns {Promise<Array>} Array of migration files
     */
    async discoverMigrations() {
        const pattern = path.join(this.config.migrationsPath, this.config.migrationsPattern);

        try {
            const files = await globAsync(pattern, {
                nodir: true
            });

            const migrations = [];

            for (const filePath of files) {
                try {
                    const migration = await this._loadMigration(filePath);
                    if (migration) {
                        migrations.push(migration);
                    }
                } catch (error) {
                    this.logger.error(`Failed to load migration ${filePath}`, {
                        error: error.message
                    });
                }
            }

            // Sort migrations by version/timestamp
            migrations.sort((a, b) => {
                if (a.version && b.version) {
                    return a.version.localeCompare(b.version);
                }
                return a.timestamp - b.timestamp;
            });

            this.logger.info(`Discovered ${migrations.length} migrations`);

            return migrations;

        } catch (error) {
            this.logger.error('Failed to discover migrations', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Loads a migration file
     * @private
     * @param {string} filePath - Migration file path
     * @returns {Promise<Object>} Migration object
     */
    async _loadMigration(filePath) {
        try {
            // Clear module cache in development
            if (process.env.NODE_ENV === 'development') {
                delete require.cache[require.resolve(filePath)];
            }

            const migrationModule = require(filePath);
            const fileName = path.basename(filePath, '.js');

            // Extract version from filename (e.g., "001-create-users.migration.js")
            const versionMatch = fileName.match(/^(\d+)/);
            const version = versionMatch ? versionMatch[1] : fileName;

            // Validate migration structure
            if (!migrationModule.up || typeof migrationModule.up !== 'function') {
                throw new Error(`Migration ${fileName} missing 'up' function`);
            }

            if (!migrationModule.down || typeof migrationModule.down !== 'function') {
                throw new Error(`Migration ${fileName} missing 'down' function`);
            }

            return {
                name: fileName,
                version,
                filePath,
                description: migrationModule.description || fileName,
                databases: migrationModule.databases || this.config.databases,
                dependencies: migrationModule.dependencies || [],
                timestamp: migrationModule.timestamp || Date.now(),
                checksum: await this._calculateChecksum(filePath),
                up: migrationModule.up,
                down: migrationModule.down,
                validate: migrationModule.validate,
                timeout: migrationModule.timeout || 60000
            };

        } catch (error) {
            this.logger.error(`Failed to load migration from ${filePath}`, {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Calculates checksum for a migration file
     * @private
     * @param {string} filePath - File path
     * @returns {Promise<string>} File checksum
     */
    async _calculateChecksum(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Gets migration status for all databases
     * @returns {Promise<Object>} Migration status
     */
    async getStatus() {
        const status = {
            databases: {},
            summary: {
                total: 0,
                applied: 0,
                pending: 0,
                failed: 0
            }
        };

        // Discover all migrations
        const allMigrations = await this.discoverMigrations();
        status.summary.total = allMigrations.length;

        // Check status for each database
        for (const dbName of this.config.databases) {
            const db = this.connectionManager.getDatabase(dbName);
            if (!db) {
                status.databases[dbName] = { error: 'Database not available' };
                continue;
            }

            const collection = db.db.collection(this.config.migrationsTable);
            const appliedMigrations = await collection.find({}).toArray();

            const dbStatus = {
                applied: [],
                pending: [],
                failed: []
            };

            // Check each migration
            for (const migration of allMigrations) {
                const applied = appliedMigrations.find(m => m.name === migration.name);

                if (applied) {
                    if (applied.status === 'failed') {
                        dbStatus.failed.push({
                            name: migration.name,
                            version: migration.version,
                            error: applied.error,
                            failedAt: applied.failedAt
                        });
                    } else {
                        dbStatus.applied.push({
                            name: migration.name,
                            version: migration.version,
                            appliedAt: applied.appliedAt,
                            duration: applied.duration
                        });
                    }
                } else {
                    dbStatus.pending.push({
                        name: migration.name,
                        version: migration.version,
                        description: migration.description
                    });
                }
            }

            status.databases[dbName] = dbStatus;
            status.summary.applied += dbStatus.applied.length;
            status.summary.pending += dbStatus.pending.length;
            status.summary.failed += dbStatus.failed.length;
        }

        return status;
    }

    /**
     * Runs pending migrations
     * @param {Object} options - Run options
     * @returns {Promise<Object>} Run results
     */
    async run(options = {}) {
        if (this.state.isRunning) {
            throw new Error('Migrations are already running');
        }

        const startTime = Date.now();
        const runId = crypto.randomBytes(8).toString('hex');

        this.state.isRunning = true;

        const results = {
            runId,
            startTime: new Date().toISOString(),
            databases: {},
            summary: {
                total: 0,
                successful: 0,
                failed: 0,
                skipped: 0
            }
        };

        try {
            this.logger.info('Starting migration run', { runId, dryRun: this.config.dryRun });

            // Discover migrations
            const migrations = await this.discoverMigrations();

            // Filter migrations if specific ones requested
            const migrationsToRun = options.migrations
                ? migrations.filter(m => options.migrations.includes(m.name))
                : migrations;

            // Run migrations for each database
            for (const dbName of this.config.databases) {
                if (options.databases && !options.databases.includes(dbName)) {
                    continue;
                }

                const dbResults = await this._runMigrationsForDatabase(
                    dbName,
                    migrationsToRun,
                    options
                );

                results.databases[dbName] = dbResults;
                results.summary.total += dbResults.total;
                results.summary.successful += dbResults.successful;
                results.summary.failed += dbResults.failed;
                results.summary.skipped += dbResults.skipped;
            }

            // Calculate duration
            results.duration = Date.now() - startTime;

            // Update metrics
            this._updateMetrics('run', results);

            // Store in history
            this.history.runs.push(results);

            this.logger.info('Migration run completed', {
                runId,
                duration: `${results.duration}ms`,
                summary: results.summary
            });

            return results;

        } catch (error) {
            this.logger.error('Migration run failed', {
                runId,
                error: error.message,
                stack: error.stack
            });

            results.error = error.message;
            this.history.errors.push({
                runId,
                error: error.message,
                timestamp: new Date().toISOString()
            });

            throw error;

        } finally {
            this.state.isRunning = false;
        }
    }

    /**
     * Runs migrations for a specific database
     * @private
     * @param {string} dbName - Database name
     * @param {Array} migrations - Migrations to run
     * @param {Object} options - Run options
     * @returns {Promise<Object>} Run results
     */
    async _runMigrationsForDatabase(dbName, migrations, options = {}) {
        const db = this.connectionManager.getDatabase(dbName);
        if (!db) {
            return {
                error: 'Database not available',
                total: 0,
                successful: 0,
                failed: 0,
                skipped: 0
            };
        }

        const collection = db.db.collection(this.config.migrationsTable);
        const results = {
            total: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
            migrations: []
        };

        // Get applied migrations
        const appliedMigrations = await collection.find({}).toArray();
        const appliedMap = new Map(appliedMigrations.map(m => [m.name, m]));

        // Acquire lock
        const lockAcquired = await this._acquireLock(dbName);
        if (!lockAcquired) {
            throw new Error(`Could not acquire migration lock for ${dbName}`);
        }

        try {
            // Process each migration
            for (const migration of migrations) {
                // Skip if not for this database
                if (!migration.databases.includes(dbName)) {
                    continue;
                }

                results.total++;

                // Check if already applied
                if (appliedMap.has(migration.name)) {
                    const applied = appliedMap.get(migration.name);

                    // Check checksum
                    if (applied.checksum !== migration.checksum) {
                        this.logger.warn(`Migration ${migration.name} has been modified since it was applied`);
                    }

                    results.skipped++;
                    results.migrations.push({
                        name: migration.name,
                        status: 'skipped',
                        reason: 'Already applied'
                    });
                    continue;
                }

                // Check dependencies
                const unmetDependencies = this._checkDependencies(migration, appliedMap);
                if (unmetDependencies.length > 0) {
                    results.failed++;
                    results.migrations.push({
                        name: migration.name,
                        status: 'failed',
                        error: `Unmet dependencies: ${unmetDependencies.join(', ')}`
                    });

                    if (!this.config.continueOnError) {
                        throw new Error(`Migration ${migration.name} has unmet dependencies`);
                    }
                    continue;
                }

                // Run migration
                const migrationResult = await this._runSingleMigration(
                    db,
                    migration,
                    options
                );

                if (migrationResult.success) {
                    results.successful++;

                    // Record in database (unless dry run)
                    if (!this.config.dryRun) {
                        await collection.insertOne({
                            name: migration.name,
                            version: migration.version,
                            description: migration.description,
                            checksum: migration.checksum,
                            appliedAt: new Date(),
                            duration: migrationResult.duration,
                            batch: options.batch || Date.now(),
                            status: 'applied'
                        });
                    }
                } else {
                    results.failed++;

                    // Record failure (unless dry run)
                    if (!this.config.dryRun) {
                        await collection.insertOne({
                            name: migration.name,
                            version: migration.version,
                            description: migration.description,
                            checksum: migration.checksum,
                            failedAt: new Date(),
                            error: migrationResult.error,
                            status: 'failed'
                        });
                    }

                    if (!this.config.continueOnError) {
                        throw new Error(`Migration ${migration.name} failed: ${migrationResult.error}`);
                    }
                }

                results.migrations.push(migrationResult);
            }

            return results;

        } finally {
            await this._releaseLock(dbName);
        }
    }

    /**
     * Runs a single migration
     * @private
     * @param {Object} db - Database connection
     * @param {Object} migration - Migration to run
     * @param {Object} options - Run options
     * @returns {Promise<Object>} Migration result
     */
    async _runSingleMigration(db, migration, options = {}) {
        const startTime = Date.now();

        this.state.currentMigration = migration.name;

        try {
            this.logger.info(`Running migration: ${migration.name}`);

            // Validate migration if required
            if (this.config.validateBeforeRun && migration.validate) {
                const validationResult = await migration.validate(db);
                if (!validationResult.valid) {
                    throw new Error(`Validation failed: ${validationResult.error}`);
                }
            }

            // Create migration context
            const context = {
                db,
                logger: this.logger,
                config: this.config,
                dryRun: this.config.dryRun,
                options
            };

            // Run migration with timeout
            if (!this.config.dryRun) {
                await this._runWithTimeout(
                    () => migration.up(context),
                    migration.timeout
                );
            } else {
                this.logger.info(`[DRY RUN] Would run migration: ${migration.name}`);
            }

            const duration = Date.now() - startTime;

            this.logger.info(`Migration completed: ${migration.name}`, {
                duration: `${duration}ms`
            });

            return {
                name: migration.name,
                status: 'success',
                success: true,
                duration
            };

        } catch (error) {
            const duration = Date.now() - startTime;

            this.logger.error(`Migration failed: ${migration.name}`, {
                error: error.message,
                duration: `${duration}ms`
            });

            return {
                name: migration.name,
                status: 'failed',
                success: false,
                error: error.message,
                duration
            };

        } finally {
            this.state.currentMigration = null;
        }
    }

    /**
     * Rolls back migrations
     * @param {Object} options - Rollback options
     * @returns {Promise<Object>} Rollback results
     */
    async rollback(options = {}) {
        if (this.state.isRunning) {
            throw new Error('Migrations are already running');
        }

        const startTime = Date.now();
        const rollbackId = crypto.randomBytes(8).toString('hex');

        this.state.isRunning = true;

        const results = {
            rollbackId,
            startTime: new Date().toISOString(),
            databases: {},
            summary: {
                total: 0,
                successful: 0,
                failed: 0
            }
        };

        try {
            this.logger.info('Starting migration rollback', { rollbackId });

            // Rollback for each database
            for (const dbName of this.config.databases) {
                if (options.databases && !options.databases.includes(dbName)) {
                    continue;
                }

                const dbResults = await this._rollbackForDatabase(dbName, options);

                results.databases[dbName] = dbResults;
                results.summary.total += dbResults.total;
                results.summary.successful += dbResults.successful;
                results.summary.failed += dbResults.failed;
            }

            // Calculate duration
            results.duration = Date.now() - startTime;

            // Update metrics
            this._updateMetrics('rollback', results);

            // Store in history
            this.history.rollbacks.push(results);

            this.logger.info('Migration rollback completed', {
                rollbackId,
                duration: `${results.duration}ms`,
                summary: results.summary
            });

            return results;

        } catch (error) {
            this.logger.error('Migration rollback failed', {
                rollbackId,
                error: error.message
            });

            results.error = error.message;
            throw error;

        } finally {
            this.state.isRunning = false;
        }
    }

    /**
     * Rolls back migrations for a specific database
     * @private
     * @param {string} dbName - Database name
     * @param {Object} options - Rollback options
     * @returns {Promise<Object>} Rollback results
     */
    async _rollbackForDatabase(dbName, options = {}) {
        const db = this.connectionManager.getDatabase(dbName);
        if (!db) {
            return {
                error: 'Database not available',
                total: 0,
                successful: 0,
                failed: 0
            };
        }

        const collection = db.db.collection(this.config.migrationsTable);
        const results = {
            total: 0,
            successful: 0,
            failed: 0,
            migrations: []
        };

        // Get applied migrations
        const query = options.batch ? { batch: options.batch } : {};
        const appliedMigrations = await collection
            .find(query)
            .sort({ appliedAt: -1 })
            .limit(options.steps || 1)
            .toArray();

        // Load migration files
        const migrations = await this.discoverMigrations();
        const migrationMap = new Map(migrations.map(m => [m.name, m]));

        // Acquire lock
        const lockAcquired = await this._acquireLock(dbName);
        if (!lockAcquired) {
            throw new Error(`Could not acquire migration lock for ${dbName}`);
        }

        try {
            // Rollback each migration
            for (const applied of appliedMigrations) {
                results.total++;

                const migration = migrationMap.get(applied.name);
                if (!migration) {
                    results.failed++;
                    results.migrations.push({
                        name: applied.name,
                        status: 'failed',
                        error: 'Migration file not found'
                    });
                    continue;
                }

                // Run rollback
                const rollbackResult = await this._rollbackSingleMigration(
                    db,
                    migration,
                    options
                );

                if (rollbackResult.success) {
                    results.successful++;

                    // Remove from database (unless dry run)
                    if (!this.config.dryRun) {
                        await collection.deleteOne({ name: migration.name });
                    }
                } else {
                    results.failed++;

                    if (!this.config.continueOnError) {
                        throw new Error(`Rollback failed for ${migration.name}: ${rollbackResult.error}`);
                    }
                }

                results.migrations.push(rollbackResult);
            }

            return results;

        } finally {
            await this._releaseLock(dbName);
        }
    }

    /**
     * Rolls back a single migration
     * @private
     * @param {Object} db - Database connection
     * @param {Object} migration - Migration to rollback
     * @param {Object} options - Rollback options
     * @returns {Promise<Object>} Rollback result
     */
    async _rollbackSingleMigration(db, migration, options = {}) {
        const startTime = Date.now();

        this.state.currentMigration = migration.name;

        try {
            this.logger.info(`Rolling back migration: ${migration.name}`);

            // Create migration context
            const context = {
                db,
                logger: this.logger,
                config: this.config,
                dryRun: this.config.dryRun,
                options
            };

            // Run rollback with timeout
            if (!this.config.dryRun) {
                await this._runWithTimeout(
                    () => migration.down(context),
                    migration.timeout
                );
            } else {
                this.logger.info(`[DRY RUN] Would rollback migration: ${migration.name}`);
            }

            const duration = Date.now() - startTime;

            this.logger.info(`Rollback completed: ${migration.name}`, {
                duration: `${duration}ms`
            });

            return {
                name: migration.name,
                status: 'success',
                success: true,
                duration
            };

        } catch (error) {
            const duration = Date.now() - startTime;

            this.logger.error(`Rollback failed: ${migration.name}`, {
                error: error.message,
                duration: `${duration}ms`
            });

            return {
                name: migration.name,
                status: 'failed',
                success: false,
                error: error.message,
                duration
            };

        } finally {
            this.state.currentMigration = null;
        }
    }

    /**
     * Checks migration dependencies
     * @private
     * @param {Object} migration - Migration to check
     * @param {Map} appliedMap - Map of applied migrations
     * @returns {Array} Unmet dependencies
     */
    _checkDependencies(migration, appliedMap) {
        const unmet = [];

        for (const dep of migration.dependencies) {
            if (!appliedMap.has(dep)) {
                unmet.push(dep);
            }
        }

        return unmet;
    }

    /**
     * Runs a function with timeout
     * @private
     * @param {Function} fn - Function to run
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<any>} Function result
     */
    async _runWithTimeout(fn, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Migration timeout after ${timeout}ms`));
            }, timeout);

            fn()
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    /**
     * Acquires a migration lock
     * @private
     * @param {string} dbName - Database name
     * @returns {Promise<boolean>} Lock acquired
     */
    async _acquireLock(dbName) {
        const db = this.connectionManager.getDatabase(dbName);
        if (!db) return false;

        const lockCollection = db.db.collection('_migration_locks');
        const lockId = crypto.randomBytes(16).toString('hex');

        try {
            await lockCollection.insertOne({
                _id: 'migration_lock',
                lockId,
                acquiredAt: new Date(),
                expiresAt: new Date(Date.now() + this.config.lockTimeout)
            });

            this.state.locks.set(dbName, lockId);
            return true;

        } catch (error) {
            if (error.code === 11000) {
                // Lock already exists, check if expired
                const existingLock = await lockCollection.findOne({ _id: 'migration_lock' });

                if (existingLock && existingLock.expiresAt < new Date()) {
                    // Lock expired, try to acquire
                    await lockCollection.deleteOne({ _id: 'migration_lock' });
                    return this._acquireLock(dbName);
                }

                return false;
            }
            throw error;
        }
    }

    /**
     * Releases a migration lock
     * @private
     * @param {string} dbName - Database name
     * @returns {Promise<void>}
     */
    async _releaseLock(dbName) {
        const db = this.connectionManager.getDatabase(dbName);
        if (!db) return;

        const lockId = this.state.locks.get(dbName);
        if (!lockId) return;

        const lockCollection = db.db.collection('_migration_locks');

        try {
            await lockCollection.deleteOne({
                _id: 'migration_lock',
                lockId
            });

            this.state.locks.delete(dbName);

        } catch (error) {
            this.logger.error(`Failed to release migration lock for ${dbName}`, {
                error: error.message
            });
        }
    }

    /**
     * Updates metrics
     * @private
     * @param {string} type - Metric type
     * @param {Object} results - Operation results
     */
    _updateMetrics(type, results) {
        if (type === 'run') {
            this.metrics.totalRuns++;
        } else if (type === 'rollback') {
            this.metrics.totalRollbacks++;
        }

        if (results.summary.failed > 0) {
            this.metrics.totalFailures++;
        }

        if (results.duration) {
            this.metrics.runTimes.push(results.duration);

            // Keep only last 100 run times
            if (this.metrics.runTimes.length > 100) {
                this.metrics.runTimes = this.metrics.runTimes.slice(-100);
            }

            // Calculate average
            const sum = this.metrics.runTimes.reduce((a, b) => a + b, 0);
            this.metrics.averageRunTime = sum / this.metrics.runTimes.length;
        }
    }

    /**
     * Creates a new migration file
     * @param {Object} options - Migration options
     * @returns {Promise<string>} Migration file path
     */
    async create(options = {}) {
        const timestamp = Date.now();
        const version = options.version || String(timestamp);
        const name = options.name || 'unnamed-migration';
        const fileName = `${version}-${name}.migration.js`;
        const filePath = path.join(this.config.migrationsPath, fileName);

        const template = `/**
 * Migration: ${name}
 * Version: ${version}
 * Created: ${new Date().toISOString()}
 */

module.exports = {
    version: '${version}',
    description: '${options.description || name}',
    databases: ${JSON.stringify(options.databases || this.config.databases)},
    dependencies: ${JSON.stringify(options.dependencies || [])},

    /**
     * Run the migration
     * @param {Object} context - Migration context
     * @param {Object} context.db - Database connection
     * @param {Object} context.logger - Logger instance
     * @param {Object} context.config - Migration configuration
     */
    async up(context) {
        const { db, logger } = context;

        // TODO: Implement migration logic
        logger.info('Running migration: ${name}');

        // Example: Create a collection
        // await db.db.createCollection('new_collection');

        // Example: Add an index
        // const collection = db.db.collection('existing_collection');
        // await collection.createIndex({ field: 1 });
    },

    /**
     * Rollback the migration
     * @param {Object} context - Migration context
     */
    async down(context) {
        const { db, logger } = context;

        // TODO: Implement rollback logic
        logger.info('Rolling back migration: ${name}');

        // Example: Drop a collection
        // await db.db.dropCollection('new_collection');

        // Example: Drop an index
        // const collection = db.db.collection('existing_collection');
        // await collection.dropIndex('field_1');
    },

    /**
     * Validate before running (optional)
     * @param {Object} db - Database connection
     * @returns {Object} Validation result
     */
    async validate(db) {
        // TODO: Add validation logic if needed
        return { valid: true };
    }
};`;

        await fs.writeFile(filePath, template, 'utf8');

        this.logger.info(`Created migration file: ${filePath}`);

        return filePath;
    }

    /**
     * Gets migration history
     * @returns {Object} Migration history
     */
    getHistory() {
        return {
            runs: this.history.runs.slice(-50),
            rollbacks: this.history.rollbacks.slice(-50),
            errors: this.history.errors.slice(-50),
            metrics: this.metrics
        };
    }

    /**
     * Resets migration tracking for a database
     * @param {string} dbName - Database name
     * @param {boolean} confirm - Confirmation flag
     * @returns {Promise<void>}
     */
    async reset(dbName, confirm = false) {
        if (!confirm) {
            throw new Error('Reset requires confirmation');
        }

        const db = this.connectionManager.getDatabase(dbName);
        if (!db) {
            throw new Error(`Database ${dbName} not available`);
        }

        await db.db.collection(this.config.migrationsTable).deleteMany({});
        await db.db.collection('_migration_locks').deleteMany({});

        this.logger.warn(`Reset migration tracking for ${dbName}`);
    }
}

module.exports = MigrationRunner;
