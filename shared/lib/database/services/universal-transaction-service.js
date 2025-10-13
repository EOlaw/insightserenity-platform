/**
 * @fileoverview Universal Multi-Document Transaction Service
 * @module shared/lib/database/services/universal-transaction-service
 * @description Enterprise-grade transaction management for MongoDB multi-document operations
 * Integrates with ConnectionManager and DatabaseService for reliable model access
 */

const crypto = require('crypto');
const logger = require('../../utils/logger').createLogger({
    serviceName: 'universal-transaction-service'
});
const { AppError } = require('../../utils/app-error');

/**
 * Universal Transaction Service
 * Provides atomic multi-document transaction capabilities for any entity combination
 * Uses the established DatabaseService pattern for model resolution
 */
class UniversalTransactionService {
    constructor() {
        this._databaseService = null;
        this._connectionManager = null;
        this._activeTransactions = new Map();
        this._transactionMetrics = {
            total: 0,
            successful: 0,
            failed: 0,
            aborted: 0,
            averageDuration: 0
        };
    }

    /**
     * Get database service instance with lazy initialization
     * @private
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
     * @param {Object} primaryEntity - Primary entity data and configuration
     * @param {string} primaryEntity.type - Entity type identifier (e.g., 'User')
     * @param {Object} primaryEntity.data - Entity document data
     * @param {string} primaryEntity.database - Database name (default: 'customer')
     * @param {Array<Object>} relatedEntities - Array of related entities to create
     * @param {Object} options - Transaction options
     * @param {string} options.tenantId - Tenant identifier for isolation
     * @param {Object} options.metadata - Additional transaction metadata
     * @param {Function} options.preCommitHook - Optional function to run before commit
     * @param {Function} options.postCommitHook - Optional function to run after commit
     * @returns {Promise<Object>} Transaction result with all created entities
     */
    async executeTransaction(primaryEntity, relatedEntities = [], options = {}) {
        const transactionId = this._generateTransactionId();
        const startTime = Date.now();
        
        const transactionContext = {
            id: transactionId,
            tenantId: options.tenantId || 'default',
            metadata: options.metadata || {},
            entities: [],
            startTime,
            status: 'pending'
        };

        this._activeTransactions.set(transactionId, transactionContext);
        this._transactionMetrics.total++;

        logger.info('Starting universal transaction', {
            transactionId,
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

            const updatedPrimaryResult = await this._linkRelatedEntities(
                connection,
                databaseName,
                primaryEntity,
                primaryResult,
                relatedResults,
                session,
                transactionContext
            );

            if (options.preCommitHook && typeof options.preCommitHook === 'function') {
                await options.preCommitHook({
                    session,
                    primaryEntity: updatedPrimaryResult,
                    relatedEntities: relatedResults,
                    transactionContext
                });
            }

            await session.commitTransaction();

            const duration = Date.now() - startTime;
            transactionContext.status = 'committed';
            transactionContext.duration = duration;

            this._transactionMetrics.successful++;
            this._updateAverageDuration(duration);

            logger.info('Transaction committed successfully', {
                transactionId,
                duration: `${duration}ms`,
                entitiesCreated: transactionContext.entities.length
            });

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
                    duration,
                    entitiesCreated: transactionContext.entities.length
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

            logger.error('Transaction failed', {
                transactionId,
                error: error.message,
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
                    originalError: error.message,
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
     * Create related entities and establish relationships
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
                    
                    logger.debug('Linking strategy applied', {
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
     * Link related entities back to primary entity
     * @private
     */
    async _linkRelatedEntities(connection, databaseName, primaryEntityConfig, primaryEntity, relatedResults, session, transactionContext) {
        if (relatedResults.length === 0) {
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
                logger.debug('No linking fields specified, skipping primary entity update', {
                    transactionId: transactionContext.id,
                    primaryEntityId: primaryEntity._id
                });
                return primaryEntity;
            }

            const updatedEntity = await Model.findByIdAndUpdate(
                primaryEntity._id,
                updates,
                { session, new: true }
            );

            logger.debug('Primary entity updated with related entity references', {
                transactionId: transactionContext.id,
                primaryEntityId: primaryEntity._id,
                updates: Object.keys(updates)
            });

            return updatedEntity;

        } catch (error) {
            logger.error('Failed to link related entities to primary entity', {
                transactionId: transactionContext.id,
                primaryEntityId: primaryEntity._id,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Verify transaction integrity after commit
     * 
     * @param {string} transactionId - Transaction identifier
     * @returns {Promise<Object>} Verification result
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

            const primaryEntity = transactionContext.entities.find(e => e.role === 'primary');
            const relatedEntities = transactionContext.entities.filter(e => e.role === 'related');

            if (primaryEntity && relatedEntities.length > 0) {
                const PrimaryModel = dbService.getModel(primaryEntity.type, 'customer');
                const primaryDoc = await PrimaryModel.findById(primaryEntity.id);

                for (const relatedEntity of relatedEntities) {
                    const hasReference = Object.values(primaryDoc.toObject()).some(value => {
                        if (value && typeof value === 'object' && value.toString) {
                            return value.toString() === relatedEntity.id.toString();
                        }
                        return false;
                    });

                    if (!hasReference) {
                        logger.warn('Missing relationship reference', {
                            transactionId,
                            primaryEntity: primaryEntity.id,
                            relatedEntity: relatedEntity.id
                        });
                    }
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
     * @returns {Object} Current transaction metrics
     */
    getMetrics() {
        return {
            ...this._transactionMetrics,
            activeTransactions: this._activeTransactions.size,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get active transaction contexts
     * @returns {Array<Object>} Active transaction contexts
     */
    getActiveTransactions() {
        return Array.from(this._activeTransactions.entries()).map(([id, context]) => ({
            id,
            status: context.status,
            duration: context.duration || (Date.now() - context.startTime),
            entitiesCreated: context.entities.length
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
}

module.exports = new UniversalTransactionService();