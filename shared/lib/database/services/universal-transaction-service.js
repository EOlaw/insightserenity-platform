/**
 * @fileoverview Universal Multi-Document Transaction Service - Complete Updated Version
 * @module shared/lib/database/services/universal-transaction-service
 * @description Enterprise-grade transaction management for MongoDB multi-document operations
 * with two-phase commit pattern, automatic retry logic, and comprehensive error handling
 * 
 * @version 2.0.0
 * @updated 2025-10-14
 * 
 * IMPLEMENTATION NOTES:
 * - Implements two-phase commit to prevent MongoDB lock conflicts
 * - Phase 1: Creates all entities within transaction with forward references only
 * - Phase 2: Updates back-references after transaction commits (outside transaction)
 * - Automatic retry logic for transient MongoDB errors with exponential backoff
 * - Comprehensive logging and transaction verification capabilities
 * 
 * BREAKING CHANGES FROM v1.0:
 * - Back-references now update outside transaction scope
 * - Added automatic retry mechanism for lock conflicts
 * - Enhanced error categorization and handling
 * - New transaction metrics tracking retry attempts
 */

const crypto = require('crypto');
const logger = require('../../utils/logger').createLogger({
    serviceName: 'universal-transaction-service'
});
const { AppError } = require('../../utils/app-error');

/**
 * @class UniversalTransactionService
 * @description Provides atomic multi-document transaction capabilities with lock conflict resolution
 * 
 * This service manages complex multi-entity transactions in MongoDB, ensuring ACID properties
 * while avoiding common pitfalls like lock conflicts and race conditions. It uses a two-phase
 * commit pattern where entities are created in phase one and relationships are established
 * in phase two after the transaction has successfully committed.
 * 
 * Key features:
 * - Two-phase commit pattern for lock conflict prevention
 * - Automatic retry logic with exponential backoff
 * - Transaction integrity verification
 * - Comprehensive metrics and monitoring
 * - Pre-commit and post-commit hooks
 * - Tenant isolation support
 */
class UniversalTransactionService {
    constructor() {
        this._databaseService = null;
        this._connectionManager = null;
        this._activeTransactions = new Map();

        // Transaction metrics with retry tracking
        this._transactionMetrics = {
            total: 0,
            successful: 0,
            failed: 0,
            aborted: 0,
            retried: 0,
            averageDuration: 0,
            totalRetryAttempts: 0
        };

        // Retry configuration with sensible defaults
        this._retryConfig = {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 5000,
            backoffMultiplier: 2,
            jitterEnabled: true
        };
    }

    /**
     * Get database service instance with lazy initialization
     * @private
     * @returns {Object} Database service instance
     */
    _getDatabaseService() {
        if (!this._databaseService) {
            const database = require('../index');
            this._databaseService = database.getDatabaseService();
        }
        return this._databaseService;
    }

    /**
     * Get connection manager instance with lazy initialization
     * @private
     * @returns {Object} Connection manager instance
     */
    _getConnectionManager() {
        if (!this._connectionManager) {
            const database = require('../index');
            this._connectionManager = database.getInstance();
        }
        return this._connectionManager;
    }

    /**
     * Execute a multi-document transaction with entity strategies
     * 
     * This is the main entry point for transaction execution. It automatically retries
     * on transient MongoDB errors and implements a two-phase commit pattern to prevent
     * lock conflicts. The method validates all inputs, creates entities within a MongoDB
     * transaction, commits the transaction, and then updates any back-references outside
     * the transaction scope.
     * 
     * @param {Object} primaryEntity - Primary entity data and configuration
     * @param {string} primaryEntity.type - Entity type identifier (e.g., 'User')
     * @param {Object} primaryEntity.data - Entity document data
     * @param {string} primaryEntity.database - Database name (default: 'customer')
     * @param {Array<Object>} relatedEntities - Array of related entities to create
     * @param {string} relatedEntities[].type - Related entity type
     * @param {Object} relatedEntities[].data - Related entity data (optional if prepareUsing provided)
     * @param {Function} relatedEntities[].prepareUsing - Function to prepare entity data from primary entity
     * @param {Function} relatedEntities[].linkingStrategy - Function to establish relationships
     * @param {string} relatedEntities[].linkingField - Field name on primary entity for back-reference
     * @param {Object} options - Transaction options
     * @param {string} options.tenantId - Tenant identifier for isolation
     * @param {Object} options.metadata - Additional transaction metadata
     * @param {Function} options.preCommitHook - Optional function to run before commit
     * @param {Function} options.postCommitHook - Optional function to run after commit
     * @param {number} options.maxRetries - Override default max retry attempts
     * @returns {Promise<Object>} Transaction result with all created entities and transaction details
     * @throws {AppError} If transaction fails after all retry attempts
     */
    async executeTransaction(primaryEntity, relatedEntities = [], options = {}) {
        const maxRetries = options.maxRetries || this._retryConfig.maxRetries;
        let lastError;
        let retryCount = 0;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this._executeTransactionAttempt(
                    primaryEntity,
                    relatedEntities,
                    options,
                    attempt
                );
            } catch (error) {
                lastError = error;
                retryCount = attempt;

                if (this._isRetriableError(error) && attempt < maxRetries) {
                    const delay = this._calculateRetryDelay(attempt);

                    logger.warn('Transaction attempt failed, will retry', {
                        attempt,
                        maxRetries,
                        nextRetryIn: `${delay}ms`,
                        error: error.message,
                        errorCode: error.code,
                        errorType: this._categorizeError(error)
                    });

                    this._transactionMetrics.retried++;
                    this._transactionMetrics.totalRetryAttempts++;

                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                break;
            }
        }

        logger.error('Transaction failed after all retry attempts', {
            totalAttempts: retryCount,
            maxRetries,
            finalError: lastError.message,
            errorStack: lastError.stack
        });

        throw lastError;
    }

    /**
     * Execute a single transaction attempt with two-phase commit
     * 
     * This method implements the core transaction logic:
     * Phase 1: Create all entities within a MongoDB session transaction
     * Phase 2: Update back-references outside the transaction after successful commit
     * 
     * @private
     * @param {Object} primaryEntity - Primary entity configuration
     * @param {Array<Object>} relatedEntities - Related entities configuration
     * @param {Object} options - Transaction options
     * @param {number} attemptNumber - Current attempt number for logging
     * @returns {Promise<Object>} Transaction result
     * @throws {AppError} If transaction attempt fails
     */
    async _executeTransactionAttempt(primaryEntity, relatedEntities, options, attemptNumber) {
        const transactionId = this._generateTransactionId();
        const startTime = Date.now();

        const transactionContext = {
            id: transactionId,
            tenantId: options.tenantId || 'default',
            metadata: options.metadata || {},
            entities: [],
            startTime,
            status: 'pending',
            attempt: attemptNumber
        };

        this._activeTransactions.set(transactionId, transactionContext);
        this._transactionMetrics.total++;

        logger.info('Starting universal transaction', {
            transactionId,
            attempt: attemptNumber,
            primaryEntity: primaryEntity.type,
            relatedEntitiesCount: relatedEntities.length,
            tenantId: transactionContext.tenantId
        });

        let session = null;

        try {
            this._validateTransactionRequest(primaryEntity, relatedEntities);

            const connectionManager = this._getConnectionManager();
            const databaseName = primaryEntity.database || 'customer';
            const connection = connectionManager.getDatabase(databaseName);

            if (!connection) {
                throw new AppError(
                    `Database connection '${databaseName}' not available`,
                    500,
                    'DATABASE_UNAVAILABLE'
                );
            }

            session = await connection.startSession();
            const transactionOptions = this._buildTransactionOptions(options);
            session.startTransaction(transactionOptions);

            logger.debug('Transaction session started', {
                transactionId,
                sessionId: session.id,
                options: transactionOptions
            });

            transactionContext.status = 'active';
            transactionContext.sessionId = session.id;

            // PHASE 1: Create all entities within transaction
            const primaryResult = await this._createEntity(
                connection,
                databaseName,
                primaryEntity,
                session,
                transactionContext
            );

            transactionContext.entities.push({
                type: primaryEntity.type,
                id: primaryResult._id,
                role: 'primary'
            });

            logger.debug('Primary entity created', {
                transactionId,
                entityType: primaryEntity.type,
                entityId: primaryResult._id
            });

            const relatedResults = await this._createRelatedEntities(
                connection,
                databaseName,
                relatedEntities,
                primaryResult,
                session,
                transactionContext
            );

            if (options.preCommitHook && typeof options.preCommitHook === 'function') {
                await options.preCommitHook({
                    session,
                    primaryEntity: primaryResult,
                    relatedEntities: relatedResults,
                    transactionContext
                });
            }

            await session.commitTransaction();

            const commitDuration = Date.now() - startTime;
            transactionContext.status = 'committed';
            transactionContext.duration = commitDuration;

            logger.info('Transaction committed successfully', {
                transactionId,
                duration: `${commitDuration}ms`,
                entitiesCreated: transactionContext.entities.length,
                attempt: attemptNumber
            });

            // PHASE 2: Update back-references outside transaction
            const updatedPrimaryResult = await this._updateBackReferences(
                connection,
                databaseName,
                primaryEntity,
                primaryResult,
                relatedResults,
                transactionContext
            );

            this._transactionMetrics.successful++;
            this._updateAverageDuration(commitDuration);

            if (options.postCommitHook && typeof options.postCommitHook === 'function') {
                setImmediate(() => {
                    options.postCommitHook({
                        primaryEntity: updatedPrimaryResult,
                        relatedEntities: relatedResults,
                        transactionContext
                    }).catch(error => {
                        logger.error('Post-commit hook failed', {
                            transactionId,
                            error: error.message
                        });
                    });
                });
            }

            return {
                success: true,
                transaction: {
                    id: transactionId,
                    status: 'committed',
                    duration: commitDuration,
                    entitiesCreated: transactionContext.entities.length,
                    attempt: attemptNumber
                },
                entities: {
                    primary: updatedPrimaryResult,
                    related: relatedResults
                }
            };

        } catch (error) {
            if (session && session.inTransaction()) {
                try {
                    await session.abortTransaction();
                    transactionContext.status = 'aborted';
                    this._transactionMetrics.aborted++;

                    logger.warn('Transaction aborted', {
                        transactionId,
                        attempt: attemptNumber,
                        reason: error.message
                    });
                } catch (abortError) {
                    logger.error('Failed to abort transaction', {
                        transactionId,
                        error: abortError.message
                    });
                }
            }

            const duration = Date.now() - startTime;
            transactionContext.duration = duration;
            transactionContext.status = 'failed';
            transactionContext.error = error.message;

            this._transactionMetrics.failed++;

            logger.error('Transaction attempt failed', {
                transactionId,
                attempt: attemptNumber,
                error: error.message,
                errorType: this._categorizeError(error),
                stack: error.stack,
                duration: `${duration}ms`,
                primaryEntity: primaryEntity.type,
                relatedEntities: relatedEntities.map(e => e.type)
            });

            throw new AppError(
                `Transaction failed: ${error.message}`,
                error.statusCode || 500,
                'TRANSACTION_FAILED',
                {
                    transactionId,
                    attempt: attemptNumber,
                    originalError: error.message,
                    errorType: this._categorizeError(error),
                    duration,
                    entities: transactionContext.entities
                }
            );

        } finally {
            if (session) {
                try {
                    await session.endSession();
                    logger.debug('Transaction session ended', { transactionId });
                } catch (endError) {
                    logger.error('Error ending transaction session', {
                        transactionId,
                        error: endError.message
                    });
                }
            }

            setTimeout(() => {
                this._activeTransactions.delete(transactionId);
            }, 60000);
        }
    }

    /**
     * Create primary entity within transaction using DatabaseService
     * @private
     */
    async _createEntity(connection, databaseName, entityConfig, session, transactionContext) {
        const { type, data } = entityConfig;

        try {
            const dbService = this._getDatabaseService();
            let Model;

            try {
                Model = connection.model(type);
            } catch (error) {
                logger.debug('Model not found on connection, using DatabaseService', {
                    transactionId: transactionContext.id,
                    entityType: type,
                    database: databaseName
                });

                Model = dbService.getModel(type, databaseName);

                if (!Model) {
                    throw new AppError(
                        `Model '${type}' not found in database '${databaseName}'`,
                        500,
                        'MODEL_NOT_FOUND'
                    );
                }
            }

            const entityData = {
                ...data,
                _transactionMetadata: {
                    transactionId: transactionContext.id,
                    tenantId: transactionContext.tenantId,
                    createdAt: new Date()
                }
            };

            const results = await Model.create([entityData], { session });
            const createdEntity = results[0];

            logger.debug('Entity created in transaction', {
                transactionId: transactionContext.id,
                entityType: type,
                entityId: createdEntity._id
            });

            return createdEntity;

        } catch (error) {
            logger.error('Entity creation failed', {
                transactionId: transactionContext.id,
                entityType: type,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Create related entities with forward references only
     * 
     * This method creates all related entities within the transaction but only
     * establishes forward references (related -> primary). Back-references are
     * handled in phase 2 after the transaction commits to prevent lock conflicts.
     * 
     * @private
     */
    async _createRelatedEntities(connection, databaseName, relatedEntities, primaryEntity, session, transactionContext) {
        const results = [];

        for (const relatedEntityConfig of relatedEntities) {
            try {
                const { type, data, prepareUsing, linkingStrategy } = relatedEntityConfig;

                let entityData = data;
                if (!entityData && prepareUsing && typeof prepareUsing === 'function') {
                    logger.debug('Preparing entity data using strategy function', {
                        transactionId: transactionContext.id,
                        entityType: type,
                        primaryEntityId: primaryEntity._id
                    });

                    entityData = await prepareUsing(primaryEntity);

                    logger.debug('Entity data prepared successfully', {
                        transactionId: transactionContext.id,
                        entityType: type,
                        primaryEntityId: primaryEntity._id,
                        hasData: !!entityData
                    });
                }

                if (!entityData) {
                    throw new AppError(
                        `No data available for entity type '${type}'. Either provide data directly or use prepareUsing function.`,
                        500,
                        'MISSING_ENTITY_DATA'
                    );
                }

                const enhancedData = {
                    ...entityData,
                    _transactionMetadata: {
                        transactionId: transactionContext.id,
                        tenantId: transactionContext.tenantId,
                        primaryEntityId: primaryEntity._id,
                        createdAt: new Date()
                    }
                };

                if (linkingStrategy && typeof linkingStrategy === 'function') {
                    linkingStrategy(enhancedData, primaryEntity);

                    logger.debug('Forward linking strategy applied', {
                        transactionId: transactionContext.id,
                        entityType: type,
                        primaryEntityId: primaryEntity._id
                    });
                }

                const relatedEntity = await this._createEntity(
                    connection,
                    databaseName,
                    { type, data: enhancedData },
                    session,
                    transactionContext
                );

                results.push({
                    type,
                    entity: relatedEntity,
                    linkingField: relatedEntityConfig.linkingField
                });

                transactionContext.entities.push({
                    type,
                    id: relatedEntity._id,
                    role: 'related',
                    linkedTo: primaryEntity._id
                });

                logger.debug('Related entity created', {
                    transactionId: transactionContext.id,
                    entityType: type,
                    entityId: relatedEntity._id,
                    linkedTo: primaryEntity._id
                });

            } catch (error) {
                logger.error('Related entity creation failed', {
                    transactionId: transactionContext.id,
                    entityType: relatedEntityConfig.type,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        }

        return results;
    }

    /**
     * Update back-references on primary entity AFTER transaction commit
     * 
     * This is Phase 2 of the two-phase commit pattern. By updating back-references
     * outside the transaction scope, we prevent MongoDB lock conflicts that occur
     * when trying to modify the same document multiple times within a transaction.
     * 
     * CRITICAL: This method does NOT use the session parameter, ensuring updates
     * happen outside the transaction context.
     * 
     * @private
     */
    async _updateBackReferences(connection, databaseName, primaryEntityConfig, primaryEntity, relatedResults, transactionContext) {
        if (relatedResults.length === 0) {
            logger.debug('No related entities, skipping back-reference update', {
                transactionId: transactionContext.id
            });
            return primaryEntity;
        }

        try {
            const dbService = this._getDatabaseService();
            let Model;

            try {
                Model = connection.model(primaryEntityConfig.type);
            } catch (error) {
                Model = dbService.getModel(primaryEntityConfig.type, databaseName);

                if (!Model) {
                    throw new AppError(
                        `Model '${primaryEntityConfig.type}' not found`,
                        500,
                        'MODEL_NOT_FOUND'
                    );
                }
            }

            const updates = {};

            for (const relatedResult of relatedResults) {
                const { linkingField, entity } = relatedResult;

                if (linkingField) {
                    updates[linkingField] = entity._id;
                }
            }

            if (Object.keys(updates).length === 0) {
                logger.debug('No linking fields specified, skipping back-reference update', {
                    transactionId: transactionContext.id,
                    primaryEntityId: primaryEntity._id
                });
                return primaryEntity;
            }

            logger.debug('Updating back-references on primary entity', {
                transactionId: transactionContext.id,
                primaryEntityId: primaryEntity._id,
                updates: Object.keys(updates)
            });

            const updatedEntity = await Model.findByIdAndUpdate(
                primaryEntity._id,
                updates,
                { new: true }
            );

            if (!updatedEntity) {
                logger.warn('Primary entity not found for back-reference update', {
                    transactionId: transactionContext.id,
                    primaryEntityId: primaryEntity._id
                });
                return primaryEntity;
            }

            logger.debug('Back-references updated successfully', {
                transactionId: transactionContext.id,
                primaryEntityId: primaryEntity._id,
                updatedFields: Object.keys(updates)
            });

            return updatedEntity;

        } catch (error) {
            logger.warn('Back-reference update failed (non-critical)', {
                transactionId: transactionContext.id,
                primaryEntityId: primaryEntity._id,
                error: error.message,
                note: 'Transaction was successful, only back-reference update failed'
            });

            return primaryEntity;
        }
    }

    /**
     * Verify transaction integrity after commit
     * 
     * This method performs post-transaction verification to ensure all entities
     * were created successfully and contain the expected transaction metadata.
     * 
     * @param {string} transactionId - Transaction identifier
     * @returns {Promise<Object>} Verification result with detailed status
     */
    async verifyTransactionIntegrity(transactionId) {
        const transactionContext = this._activeTransactions.get(transactionId);

        if (!transactionContext) {
            return {
                valid: false,
                reason: 'Transaction context not found',
                transactionId
            };
        }

        if (transactionContext.status !== 'committed') {
            return {
                valid: false,
                reason: `Transaction status is '${transactionContext.status}', expected 'committed'`,
                transactionId
            };
        }

        try {
            const connectionManager = this._getConnectionManager();
            const connection = connectionManager.getDatabase('customer');
            const dbService = this._getDatabaseService();

            for (const entityInfo of transactionContext.entities) {
                let Model;

                try {
                    Model = connection.model(entityInfo.type);
                } catch (error) {
                    Model = dbService.getModel(entityInfo.type, 'customer');
                }

                if (!Model) {
                    return {
                        valid: false,
                        reason: `Model '${entityInfo.type}' not found`,
                        transactionId,
                        entity: entityInfo
                    };
                }

                const entity = await Model.findById(entityInfo.id);

                if (!entity) {
                    return {
                        valid: false,
                        reason: `Entity '${entityInfo.type}' with ID '${entityInfo.id}' not found`,
                        transactionId,
                        missingEntity: entityInfo
                    };
                }

                if (entity._transactionMetadata?.transactionId !== transactionId) {
                    return {
                        valid: false,
                        reason: 'Transaction metadata mismatch',
                        transactionId,
                        entity: entityInfo
                    };
                }
            }

            return {
                valid: true,
                transactionId,
                entitiesVerified: transactionContext.entities.length,
                message: 'Transaction integrity verified successfully'
            };

        } catch (error) {
            logger.error('Transaction integrity verification failed', {
                transactionId,
                error: error.message
            });

            return {
                valid: false,
                reason: 'Verification error',
                error: error.message,
                transactionId
            };
        }
    }

    /**
     * Check if error is retriable
     * @private
     */
    // _isRetriableError(error) {
    //     const retriablePatterns = [
    //         'lock conflict',
    //         'writeconflict',
    //         'unable to acquire ticket',
    //         'transienttransactionerror',
    //         'locktimeout',
    //         'conflicting lock',
    //         'ticket',
    //         'deadlock'
    //     ];

    //     const errorMessage = error.message.toLowerCase();

    //     const isRetriable = retriablePatterns.some(pattern =>
    //         errorMessage.includes(pattern)
    //     ) || error.code === 112 || error.code === 251;

    //     return isRetriable;
    // }

    _isRetriableError(error) {
        const retriablePatterns = [
            'lock conflict',
            'writeconflict',
            'unable to acquire ticket',
            'transienttransactionerror',
            'locktimeout',
            'conflicting lock',
            'ticket',
            'deadlock',
            'already in use',  // ADDED: Catches "Collection namespace...is already in use"
            'please retry'     // ADDED: Catches MongoDB's explicit retry instruction
        ];

        const errorMessage = error.message.toLowerCase();

        const isRetriable = retriablePatterns.some(pattern =>
            errorMessage.includes(pattern)
        ) || error.code === 112 || error.code === 251 || error.errorLabels?.includes('TransientTransactionError');

        if (isRetriable) {
            logger.debug('Error identified as retriable', {
                errorCode: error.code,
                errorMessage: error.message.substring(0, 100),
                hasTransientLabel: error.errorLabels?.includes('TransientTransactionError')
            });
        }

        return isRetriable;
    }

    /**
     * Categorize error for better diagnostics
     * @private
     */
    _categorizeError(error) {
        const message = error.message.toLowerCase();

        if (message.includes('lock') || message.includes('ticket')) {
            return 'LOCK_CONFLICT';
        }
        if (message.includes('timeout')) {
            return 'TIMEOUT';
        }
        if (message.includes('network')) {
            return 'NETWORK_ERROR';
        }
        if (message.includes('validation')) {
            return 'VALIDATION_ERROR';
        }
        if (error.code === 112) {
            return 'WRITE_CONFLICT';
        }

        return 'UNKNOWN_ERROR';
    }

    /**
     * Calculate retry delay with exponential backoff and jitter
     * @private
     */
    _calculateRetryDelay(attemptNumber) {
        const { baseDelay, maxDelay, backoffMultiplier, jitterEnabled } = this._retryConfig;

        const exponentialDelay = baseDelay * Math.pow(backoffMultiplier, attemptNumber - 1);

        let delay = exponentialDelay;
        if (jitterEnabled) {
            const jitterFactor = 0.5 + Math.random() * 0.5;
            delay = exponentialDelay * jitterFactor;
        }

        return Math.min(Math.round(delay), maxDelay);
    }

    /**
     * Validate transaction request
     * @private
     */
    _validateTransactionRequest(primaryEntity, relatedEntities) {
        if (!primaryEntity || typeof primaryEntity !== 'object') {
            throw new AppError('Primary entity configuration is required', 400, 'INVALID_REQUEST');
        }

        if (!primaryEntity.type || typeof primaryEntity.type !== 'string') {
            throw new AppError('Primary entity type is required', 400, 'INVALID_REQUEST');
        }

        if (!primaryEntity.data || typeof primaryEntity.data !== 'object') {
            throw new AppError('Primary entity data is required', 400, 'INVALID_REQUEST');
        }

        if (!Array.isArray(relatedEntities)) {
            throw new AppError('Related entities must be an array', 400, 'INVALID_REQUEST');
        }

        for (const relatedEntity of relatedEntities) {
            if (!relatedEntity.type) {
                throw new AppError('Each related entity must have a type', 400, 'INVALID_REQUEST');
            }

            const hasData = relatedEntity.data && typeof relatedEntity.data === 'object';
            const hasPrepareUsing = relatedEntity.prepareUsing && typeof relatedEntity.prepareUsing === 'function';

            if (!hasData && !hasPrepareUsing) {
                throw new AppError(
                    'Each related entity must have either data object or prepareUsing function',
                    400,
                    'INVALID_REQUEST'
                );
            }
        }
    }

    /**
     * Build transaction options based on requirements
     * @private
     */
    _buildTransactionOptions(options) {
        return {
            readConcern: { level: options.readConcern || 'snapshot' },
            writeConcern: {
                w: options.writeConcern || 'majority',
                j: true
            },
            readPreference: options.readPreference || 'primary',
            maxCommitTimeMS: options.maxCommitTimeMS || 30000
        };
    }

    /**
     * Get transaction metrics
     * @returns {Object} Current transaction metrics including retry statistics
     */
    getMetrics() {
        return {
            ...this._transactionMetrics,
            activeTransactions: this._activeTransactions.size,
            retryRate: this._transactionMetrics.total > 0
                ? (this._transactionMetrics.retried / this._transactionMetrics.total * 100).toFixed(2) + '%'
                : '0%',
            successRate: this._transactionMetrics.total > 0
                ? (this._transactionMetrics.successful / this._transactionMetrics.total * 100).toFixed(2) + '%'
                : '0%',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get active transaction contexts
     * @returns {Array<Object>} Active transaction contexts with current status
     */
    getActiveTransactions() {
        return Array.from(this._activeTransactions.entries()).map(([id, context]) => ({
            id,
            status: context.status,
            duration: context.duration || (Date.now() - context.startTime),
            entitiesCreated: context.entities.length,
            attempt: context.attempt,
            tenantId: context.tenantId
        }));
    }

    /**
     * Update average transaction duration
     * @private
     */
    _updateAverageDuration(duration) {
        const currentAvg = this._transactionMetrics.averageDuration;
        const totalSuccessful = this._transactionMetrics.successful;

        this._transactionMetrics.averageDuration =
            ((currentAvg * (totalSuccessful - 1)) + duration) / totalSuccessful;
    }

    /**
     * Generate unique transaction identifier
     * @private
     */
    _generateTransactionId() {
        return `txn_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    /**
     * Update retry configuration
     * @param {Object} config - New retry configuration
     */
    updateRetryConfig(config) {
        this._retryConfig = {
            ...this._retryConfig,
            ...config
        };

        logger.info('Retry configuration updated', {
            config: this._retryConfig
        });
    }

    /**
     * Get retry configuration
     * @returns {Object} Current retry configuration
     */
    getRetryConfig() {
        return { ...this._retryConfig };
    }

    /**
     * Reset metrics (for testing/maintenance)
     */
    resetMetrics() {
        this._transactionMetrics = {
            total: 0,
            successful: 0,
            failed: 0,
            aborted: 0,
            retried: 0,
            averageDuration: 0,
            totalRetryAttempts: 0
        };

        logger.info('Transaction metrics reset');
    }
}

module.exports = new UniversalTransactionService();