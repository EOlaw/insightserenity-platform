'use strict';

/**
 * @fileoverview Database transaction management with distributed transaction support
 * @module shared/lib/database/transaction-manager
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/audit/audit-service
 */

const ConnectionManager = require('./connection-manager');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const AuditService = require('../security/audit/audit-service');

/**
 * @class TransactionManager
 * @description Manages database transactions with support for distributed transactions
 */
class TransactionManager {
  /**
   * @private
   * @static
   * @readonly
   */
  static #TRANSACTION_STATES = {
    PENDING: 'pending',
    IN_PROGRESS: 'in-progress',
    COMMITTING: 'committing',
    COMMITTED: 'committed',
    ABORTING: 'aborting',
    ABORTED: 'aborted',
    FAILED: 'failed'
  };

  static #ISOLATION_LEVELS = {
    READ_UNCOMMITTED: 'read-uncommitted',
    READ_COMMITTED: 'read-committed',
    REPEATABLE_READ: 'repeatable-read',
    SERIALIZABLE: 'serializable',
    SNAPSHOT: 'snapshot'
  };

  static #TRANSACTION_OPTIONS = {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority', wtimeout: 5000 },
    readPreference: 'primary',
    maxCommitTimeMS: 60000
  };

  static #activeTransactions = new Map();
  static #transactionHistory = new Map();
  static #distributedTransactions = new Map();
  static #transactionIdCounter = 0;

  /**
   * Creates an instance of TransactionManager
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.auditService] - Audit service instance
   * @param {boolean} [options.enableAudit=true] - Enable transaction auditing
   * @param {Object} [options.defaultOptions={}] - Default transaction options
   * @param {number} [options.timeout=60000] - Transaction timeout in ms
   */
  constructor(options = {}) {
    const {
      auditService,
      enableAudit = true,
      defaultOptions = {},
      timeout = 60000
    } = options;

    this.auditService = auditService || new AuditService();
    this.enableAudit = enableAudit;
    this.defaultOptions = {
      ...TransactionManager.#TRANSACTION_OPTIONS,
      ...defaultOptions
    };
    this.timeout = timeout;
    this.transactionStack = [];
  }

  /**
   * Starts a new transaction
   * @async
   * @param {Object} [options={}] - Transaction options
   * @param {string} [options.connectionName='default'] - Connection name
   * @param {string} [options.isolationLevel] - Transaction isolation level
   * @param {boolean} [options.distributed=false] - Enable distributed transaction
   * @param {Array<string>} [options.participants=[]] - Distributed transaction participants
   * @param {Object} [options.metadata={}] - Transaction metadata
   * @returns {Promise<Object>} Transaction context
   * @throws {AppError} If transaction start fails
   */
  async startTransaction(options = {}) {
    try {
      const {
        connectionName = 'default',
        isolationLevel = TransactionManager.#ISOLATION_LEVELS.READ_COMMITTED,
        distributed = false,
        participants = [],
        metadata = {}
      } = options;

      // Get connection
      const connection = ConnectionManager.getConnection(connectionName);
      if (!connection) {
        throw new AppError('No active connection found', 400, 'NO_CONNECTION');
      }

      // Generate transaction ID
      const transactionId = this.#generateTransactionId();
      
      // Start session
      const session = await connection.startSession();

      // Configure transaction options
      const transactionOptions = {
        ...this.defaultOptions,
        ...this.#getIsolationLevelOptions(isolationLevel)
      };

      // Initialize transaction context
      const context = {
        id: transactionId,
        session,
        connection,
        connectionName,
        state: TransactionManager.#TRANSACTION_STATES.PENDING,
        distributed,
        participants: distributed ? participants : [],
        startTime: Date.now(),
        operations: [],
        metadata,
        isolationLevel,
        savepoints: new Map(),
        locks: new Set()
      };

      // Start MongoDB transaction
      await session.startTransaction(transactionOptions);
      context.state = TransactionManager.#TRANSACTION_STATES.IN_PROGRESS;

      // Store transaction
      TransactionManager.#activeTransactions.set(transactionId, context);

      // Handle distributed transaction
      if (distributed) {
        await this.#initializeDistributedTransaction(context);
      }

      // Audit transaction start
      if (this.enableAudit) {
        await this.#auditTransaction('TRANSACTION_STARTED', context);
      }

      logger.info('Transaction started', {
        transactionId,
        distributed,
        isolationLevel
      });

      return context;

    } catch (error) {
      logger.error('Failed to start transaction', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Transaction start failed',
        500,
        'TRANSACTION_START_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Commits a transaction
   * @async
   * @param {string|Object} transactionOrId - Transaction ID or context
   * @param {Object} [options={}] - Commit options
   * @returns {Promise<Object>} Commit result
   * @throws {AppError} If commit fails
   */
  async commitTransaction(transactionOrId, options = {}) {
    try {
      const context = this.#getTransactionContext(transactionOrId);
      
      if (!context) {
        throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
      }

      if (context.state !== TransactionManager.#TRANSACTION_STATES.IN_PROGRESS) {
        throw new AppError(
          'Transaction not in valid state for commit',
          400,
          'INVALID_TRANSACTION_STATE',
          { currentState: context.state }
        );
      }

      context.state = TransactionManager.#TRANSACTION_STATES.COMMITTING;

      // Handle distributed transaction commit
      if (context.distributed) {
        await this.#commitDistributedTransaction(context, options);
      }

      // Commit MongoDB transaction
      await context.session.commitTransaction();
      context.state = TransactionManager.#TRANSACTION_STATES.COMMITTED;
      context.endTime = Date.now();
      context.duration = context.endTime - context.startTime;

      // Release locks
      await this.#releaseLocks(context);

      // End session
      await context.session.endSession();

      // Move to history
      TransactionManager.#activeTransactions.delete(context.id);
      TransactionManager.#transactionHistory.set(context.id, context);

      // Audit commit
      if (this.enableAudit) {
        await this.#auditTransaction('TRANSACTION_COMMITTED', context);
      }

      logger.info('Transaction committed', {
        transactionId: context.id,
        duration: context.duration,
        operationCount: context.operations.length
      });

      return {
        transactionId: context.id,
        state: context.state,
        duration: context.duration,
        operationCount: context.operations.length
      };

    } catch (error) {
      logger.error('Failed to commit transaction', error);

      // Try to abort if commit failed
      try {
        await this.abortTransaction(transactionOrId);
      } catch (abortError) {
        logger.error('Failed to abort transaction after commit failure', abortError);
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Transaction commit failed',
        500,
        'TRANSACTION_COMMIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Aborts a transaction
   * @async
   * @param {string|Object} transactionOrId - Transaction ID or context
   * @param {Object} [options={}] - Abort options
   * @returns {Promise<Object>} Abort result
   * @throws {AppError} If abort fails
   */
  async abortTransaction(transactionOrId, options = {}) {
    try {
      const context = this.#getTransactionContext(transactionOrId);
      
      if (!context) {
        throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
      }

      if (context.state === TransactionManager.#TRANSACTION_STATES.COMMITTED ||
          context.state === TransactionManager.#TRANSACTION_STATES.ABORTED) {
        logger.warn('Transaction already finalized', {
          transactionId: context.id,
          state: context.state
        });
        return { transactionId: context.id, state: context.state };
      }

      context.state = TransactionManager.#TRANSACTION_STATES.ABORTING;

      // Handle distributed transaction abort
      if (context.distributed) {
        await this.#abortDistributedTransaction(context, options);
      }

      // Abort MongoDB transaction
      if (context.session.inTransaction()) {
        await context.session.abortTransaction();
      }

      context.state = TransactionManager.#TRANSACTION_STATES.ABORTED;
      context.endTime = Date.now();
      context.duration = context.endTime - context.startTime;
      context.abortReason = options.reason || 'User initiated abort';

      // Release locks
      await this.#releaseLocks(context);

      // End session
      await context.session.endSession();

      // Move to history
      TransactionManager.#activeTransactions.delete(context.id);
      TransactionManager.#transactionHistory.set(context.id, context);

      // Audit abort
      if (this.enableAudit) {
        await this.#auditTransaction('TRANSACTION_ABORTED', context);
      }

      logger.info('Transaction aborted', {
        transactionId: context.id,
        reason: context.abortReason,
        duration: context.duration
      });

      return {
        transactionId: context.id,
        state: context.state,
        reason: context.abortReason,
        duration: context.duration
      };

    } catch (error) {
      logger.error('Failed to abort transaction', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Transaction abort failed',
        500,
        'TRANSACTION_ABORT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Executes operations within a transaction
   * @async
   * @param {Function} callback - Operations to execute
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<*>} Operation result
   * @throws {AppError} If execution fails
   */
  async withTransaction(callback, options = {}) {
    let context;
    
    try {
      // Start transaction
      context = await this.startTransaction(options);

      // Execute callback with transaction context
      const result = await callback(context);

      // Commit transaction
      await this.commitTransaction(context);

      return result;

    } catch (error) {
      // Abort transaction on error
      if (context) {
        await this.abortTransaction(context, { reason: error.message });
      }

      logger.error('Transaction execution failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Transaction execution failed',
        500,
        'TRANSACTION_EXECUTION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates a savepoint within transaction
   * @async
   * @param {string|Object} transactionOrId - Transaction ID or context
   * @param {string} savepointName - Savepoint name
   * @returns {Promise<Object>} Savepoint info
   * @throws {AppError} If savepoint creation fails
   */
  async createSavepoint(transactionOrId, savepointName) {
    try {
      const context = this.#getTransactionContext(transactionOrId);
      
      if (!context) {
        throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
      }

      if (!savepointName) {
        throw new AppError('Savepoint name is required', 400, 'MISSING_SAVEPOINT_NAME');
      }

      if (context.savepoints.has(savepointName)) {
        throw new AppError('Savepoint already exists', 409, 'SAVEPOINT_EXISTS');
      }

      const savepoint = {
        name: savepointName,
        createdAt: Date.now(),
        operationCount: context.operations.length,
        state: { ...context }
      };

      context.savepoints.set(savepointName, savepoint);

      logger.info('Savepoint created', {
        transactionId: context.id,
        savepointName
      });

      return {
        transactionId: context.id,
        savepointName,
        operationCount: savepoint.operationCount
      };

    } catch (error) {
      logger.error('Failed to create savepoint', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Savepoint creation failed',
        500,
        'SAVEPOINT_CREATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Rolls back to a savepoint
   * @async
   * @param {string|Object} transactionOrId - Transaction ID or context
   * @param {string} savepointName - Savepoint name
   * @returns {Promise<Object>} Rollback result
   * @throws {AppError} If rollback fails
   */
  async rollbackToSavepoint(transactionOrId, savepointName) {
    try {
      const context = this.#getTransactionContext(transactionOrId);
      
      if (!context) {
        throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
      }

      const savepoint = context.savepoints.get(savepointName);
      
      if (!savepoint) {
        throw new AppError('Savepoint not found', 404, 'SAVEPOINT_NOT_FOUND');
      }

      // Rollback operations after savepoint
      const operationsToRemove = context.operations.length - savepoint.operationCount;
      context.operations.splice(savepoint.operationCount, operationsToRemove);

      // Remove savepoints created after this one
      const savepointsToRemove = [];
      for (const [name, sp] of context.savepoints) {
        if (sp.createdAt > savepoint.createdAt) {
          savepointsToRemove.push(name);
        }
      }

      savepointsToRemove.forEach(name => context.savepoints.delete(name));

      logger.info('Rolled back to savepoint', {
        transactionId: context.id,
        savepointName,
        operationsRemoved: operationsToRemove
      });

      return {
        transactionId: context.id,
        savepointName,
        operationsRemoved: operationsToRemove
      };

    } catch (error) {
      logger.error('Failed to rollback to savepoint', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Savepoint rollback failed',
        500,
        'SAVEPOINT_ROLLBACK_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Adds operation to transaction log
   * @async
   * @param {string|Object} transactionOrId - Transaction ID or context
   * @param {Object} operation - Operation details
   * @returns {Promise<void>}
   */
  async logOperation(transactionOrId, operation) {
    try {
      const context = this.#getTransactionContext(transactionOrId);
      
      if (!context) {
        throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
      }

      const operationLog = {
        timestamp: Date.now(),
        ...operation
      };

      context.operations.push(operationLog);

      logger.debug('Operation logged', {
        transactionId: context.id,
        operation: operation.type
      });

    } catch (error) {
      logger.error('Failed to log operation', error);
    }
  }

  /**
   * Acquires lock within transaction
   * @async
   * @param {string|Object} transactionOrId - Transaction ID or context
   * @param {string} resource - Resource to lock
   * @param {Object} [options={}] - Lock options
   * @returns {Promise<Object>} Lock info
   * @throws {AppError} If lock acquisition fails
   */
  async acquireLock(transactionOrId, resource, options = {}) {
    try {
      const {
        lockType = 'exclusive',
        timeout = 5000,
        waitForLock = true
      } = options;

      const context = this.#getTransactionContext(transactionOrId);
      
      if (!context) {
        throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
      }

      const lock = {
        resource,
        type: lockType,
        acquiredAt: Date.now(),
        transactionId: context.id
      };

      // In production, implement actual locking mechanism
      context.locks.add(lock);

      logger.info('Lock acquired', {
        transactionId: context.id,
        resource,
        lockType
      });

      return lock;

    } catch (error) {
      logger.error('Failed to acquire lock', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Lock acquisition failed',
        500,
        'LOCK_ACQUIRE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets transaction status
   * @param {string} transactionId - Transaction ID
   * @returns {Object|null} Transaction status
   */
  getTransactionStatus(transactionId) {
    const context = TransactionManager.#activeTransactions.get(transactionId) ||
                   TransactionManager.#transactionHistory.get(transactionId);

    if (!context) {
      return null;
    }

    return {
      id: context.id,
      state: context.state,
      distributed: context.distributed,
      startTime: context.startTime,
      endTime: context.endTime,
      duration: context.duration,
      operationCount: context.operations.length,
      savepointCount: context.savepoints.size,
      metadata: context.metadata
    };
  }

  /**
   * Lists active transactions
   * @param {Object} [filters={}] - Filter criteria
   * @returns {Array} Active transactions
   */
  listActiveTransactions(filters = {}) {
    const transactions = [];

    for (const [id, context] of TransactionManager.#activeTransactions) {
      if (this.#matchesFilters(context, filters)) {
        transactions.push(this.getTransactionStatus(id));
      }
    }

    return transactions;
  }

  /**
   * Gets transaction metrics
   * @returns {Object} Transaction metrics
   */
  getMetrics() {
    const metrics = {
      activeTransactions: TransactionManager.#activeTransactions.size,
      totalTransactions: TransactionManager.#transactionHistory.size + 
                        TransactionManager.#activeTransactions.size,
      distributedTransactions: TransactionManager.#distributedTransactions.size,
      transactionsByState: {},
      averageDuration: 0
    };

    // Count by state
    for (const state of Object.values(TransactionManager.#TRANSACTION_STATES)) {
      metrics.transactionsByState[state] = 0;
    }

    // Active transactions
    for (const context of TransactionManager.#activeTransactions.values()) {
      metrics.transactionsByState[context.state]++;
    }

    // Historical transactions
    let totalDuration = 0;
    let completedCount = 0;

    for (const context of TransactionManager.#transactionHistory.values()) {
      metrics.transactionsByState[context.state]++;
      
      if (context.duration) {
        totalDuration += context.duration;
        completedCount++;
      }
    }

    if (completedCount > 0) {
      metrics.averageDuration = totalDuration / completedCount;
    }

    return metrics;
  }

  /**
   * @private
   * Generates unique transaction ID
   * @returns {string} Transaction ID
   */
  #generateTransactionId() {
    return `txn_${Date.now()}_${++TransactionManager.#transactionIdCounter}`;
  }

  /**
   * @private
   * Gets transaction context
   * @param {string|Object} transactionOrId - Transaction ID or context
   * @returns {Object|null} Transaction context
   */
  #getTransactionContext(transactionOrId) {
    if (typeof transactionOrId === 'string') {
      return TransactionManager.#activeTransactions.get(transactionOrId);
    }
    return transactionOrId;
  }

  /**
   * @private
   * Gets isolation level options
   * @param {string} isolationLevel - Isolation level
   * @returns {Object} MongoDB transaction options
   */
  #getIsolationLevelOptions(isolationLevel) {
    const options = {};

    switch (isolationLevel) {
      case TransactionManager.#ISOLATION_LEVELS.READ_UNCOMMITTED:
        options.readConcern = { level: 'local' };
        break;

      case TransactionManager.#ISOLATION_LEVELS.READ_COMMITTED:
        options.readConcern = { level: 'majority' };
        break;

      case TransactionManager.#ISOLATION_LEVELS.REPEATABLE_READ:
        options.readConcern = { level: 'snapshot' };
        break;

      case TransactionManager.#ISOLATION_LEVELS.SERIALIZABLE:
        options.readConcern = { level: 'snapshot' };
        options.writeConcern = { w: 'majority' };
        break;

      case TransactionManager.#ISOLATION_LEVELS.SNAPSHOT:
        options.readConcern = { level: 'snapshot' };
        break;
    }

    return options;
  }

  /**
   * @private
   * Initializes distributed transaction
   * @async
   * @param {Object} context - Transaction context
   */
  async #initializeDistributedTransaction(context) {
    const distributedTxn = {
      id: context.id,
      coordinator: 'primary',
      participants: context.participants,
      state: 'preparing',
      votes: new Map(),
      preparedAt: null,
      decidedAt: null
    };

    TransactionManager.#distributedTransactions.set(context.id, distributedTxn);

    // Notify participants
    for (const participant of context.participants) {
      await this.#notifyParticipant(participant, 'PREPARE', context.id);
    }
  }

  /**
   * @private
   * Commits distributed transaction (2PC)
   * @async
   * @param {Object} context - Transaction context
   * @param {Object} options - Commit options
   */
  async #commitDistributedTransaction(context, options) {
    const distributedTxn = TransactionManager.#distributedTransactions.get(context.id);
    
    if (!distributedTxn) {
      throw new AppError('Distributed transaction not found', 404, 'DISTRIBUTED_TXN_NOT_FOUND');
    }

    // Phase 1: Voting
    distributedTxn.state = 'voting';
    const votes = await this.#collectVotes(distributedTxn);

    // Check votes
    const allVotesYes = Array.from(votes.values()).every(vote => vote === 'YES');

    if (allVotesYes) {
      // Phase 2: Commit
      distributedTxn.state = 'committing';
      await this.#notifyAllParticipants(distributedTxn, 'COMMIT');
      distributedTxn.state = 'committed';
    } else {
      // Abort if any NO votes
      throw new AppError('Distributed transaction aborted due to NO votes', 400, 'DISTRIBUTED_TXN_ABORTED');
    }
  }

  /**
   * @private
   * Aborts distributed transaction
   * @async
   * @param {Object} context - Transaction context
   * @param {Object} options - Abort options
   */
  async #abortDistributedTransaction(context, options) {
    const distributedTxn = TransactionManager.#distributedTransactions.get(context.id);
    
    if (!distributedTxn) {
      return;
    }

    distributedTxn.state = 'aborting';
    await this.#notifyAllParticipants(distributedTxn, 'ABORT');
    distributedTxn.state = 'aborted';

    TransactionManager.#distributedTransactions.delete(context.id);
  }

  /**
   * @private
   * Notifies participant in distributed transaction
   * @async
   * @param {string} participant - Participant identifier
   * @param {string} action - Action to perform
   * @param {string} transactionId - Transaction ID
   */
  async #notifyParticipant(participant, action, transactionId) {
    // Implementation would send actual network request
    logger.debug('Notifying participant', {
      participant,
      action,
      transactionId
    });
  }

  /**
   * @private
   * Notifies all participants
   * @async
   * @param {Object} distributedTxn - Distributed transaction
   * @param {string} action - Action to perform
   */
  async #notifyAllParticipants(distributedTxn, action) {
    const promises = distributedTxn.participants.map(participant =>
      this.#notifyParticipant(participant, action, distributedTxn.id)
    );

    await Promise.all(promises);
  }

  /**
   * @private
   * Collects votes from participants
   * @async
   * @param {Object} distributedTxn - Distributed transaction
   * @returns {Promise<Map>} Votes from participants
   */
  async #collectVotes(distributedTxn) {
    // Implementation would collect actual votes
    const votes = new Map();
    
    for (const participant of distributedTxn.participants) {
      votes.set(participant, 'YES'); // Simulated
    }

    return votes;
  }

  /**
   * @private
   * Releases locks held by transaction
   * @async
   * @param {Object} context - Transaction context
   */
  async #releaseLocks(context) {
    for (const lock of context.locks) {
      logger.debug('Releasing lock', {
        transactionId: context.id,
        resource: lock.resource
      });
    }
    context.locks.clear();
  }

  /**
   * @private
   * Audits transaction activity
   * @async
   * @param {string} action - Audit action
   * @param {Object} context - Transaction context
   */
  async #auditTransaction(action, context) {
    try {
      await this.auditService.logActivity({
        action,
        category: 'TRANSACTION',
        details: {
          transactionId: context.id,
          state: context.state,
          distributed: context.distributed,
          operationCount: context.operations.length,
          duration: context.duration
        },
        metadata: context.metadata
      });
    } catch (error) {
      logger.error('Failed to audit transaction', error);
    }
  }

  /**
   * @private
   * Checks if transaction matches filters
   * @param {Object} context - Transaction context
   * @param {Object} filters - Filter criteria
   * @returns {boolean} Whether transaction matches
   */
  #matchesFilters(context, filters) {
    if (filters.state && context.state !== filters.state) {
      return false;
    }

    if (filters.distributed !== undefined && context.distributed !== filters.distributed) {
      return false;
    }

    if (filters.minDuration && context.duration && context.duration < filters.minDuration) {
      return false;
    }

    return true;
  }

  /**
   * Cleans up expired transactions
   * @async
   * @param {number} [maxAge=3600000] - Maximum age in ms (default 1 hour)
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupExpiredTransactions(maxAge = 3600000) {
    const now = Date.now();
    const expiredTransactions = [];
    let cleanedCount = 0;

    // Check active transactions
    for (const [id, context] of TransactionManager.#activeTransactions) {
      if (now - context.startTime > maxAge) {
        expiredTransactions.push(id);
      }
    }

    // Abort expired transactions
    for (const transactionId of expiredTransactions) {
      try {
        await this.abortTransaction(transactionId, { reason: 'Transaction expired' });
        cleanedCount++;
      } catch (error) {
        logger.error('Failed to cleanup expired transaction', {
          transactionId,
          error: error.message
        });
      }
    }

    // Clean old history
    const historyLimit = 1000;
    if (TransactionManager.#transactionHistory.size > historyLimit) {
      const entriesToRemove = TransactionManager.#transactionHistory.size - historyLimit;
      const entries = Array.from(TransactionManager.#transactionHistory.entries());
      
      for (let i = 0; i < entriesToRemove; i++) {
        TransactionManager.#transactionHistory.delete(entries[i][0]);
      }
    }

    logger.info('Transaction cleanup completed', {
      expiredCount: expiredTransactions.length,
      cleanedCount
    });

    return {
      expiredCount: expiredTransactions.length,
      cleanedCount,
      activeTransactions: TransactionManager.#activeTransactions.size,
      historySize: TransactionManager.#transactionHistory.size
    };
  }

  /**
   * Clears all transaction data (for testing)
   * @static
   */
  static clearAll() {
    TransactionManager.#activeTransactions.clear();
    TransactionManager.#transactionHistory.clear();
    TransactionManager.#distributedTransactions.clear();
    TransactionManager.#transactionIdCounter = 0;
  }
}

module.exports = TransactionManager;