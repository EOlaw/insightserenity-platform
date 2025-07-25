'use strict';

/**
 * @fileoverview Creates database indexes for optimized query performance
 * @module shared/lib/database/migrations/001-create-indexes
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/config
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const ConnectionManager = require('../connection-manager');
const config = require('../../../config');

/**
 * @class CreateIndexesMigration
 * @description Creates comprehensive indexes across all collections for optimal query performance
 */
class CreateIndexesMigration {
  /**
   * @private
   * @static
   * @readonly
   */
  static #INDEX_DEFINITIONS = {
    // User indexes
    users: [
      { fields: { email: 1 }, options: { unique: true, sparse: true } },
      { fields: { username: 1 }, options: { unique: true, sparse: true } },
      { fields: { organizationId: 1, isActive: 1 } },
      { fields: { createdAt: -1 } },
      { fields: { 'auth.provider': 1, 'auth.providerId': 1 } },
      { fields: { roles: 1 } },
      { fields: { searchKeywords: 'text' }, options: { name: 'user_text_search' } }
    ],

    // User profiles
    user_profiles: [
      { fields: { userId: 1 }, options: { unique: true } },
      { fields: { 'preferences.timezone': 1 } },
      { fields: { updatedAt: -1 } }
    ],

    // User sessions
    user_sessions: [
      { fields: { userId: 1, isActive: 1 } },
      { fields: { token: 1 }, options: { unique: true } },
      { fields: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
      { fields: { lastActivityAt: -1 } }
    ],

    // Login history
    login_history: [
      { fields: { userId: 1, createdAt: -1 } },
      { fields: { ipAddress: 1 } },
      { fields: { success: 1 } },
      { fields: { createdAt: 1 }, options: { expireAfterSeconds: 7776000 } } // 90 days
    ],

    // Organizations
    organizations: [
      { fields: { slug: 1 }, options: { unique: true } },
      { fields: { type: 1, status: 1 } },
      { fields: { 'subscription.planId': 1, 'subscription.status': 1 } },
      { fields: { createdAt: -1 } },
      { fields: { parentOrganizationId: 1 } },
      { fields: { name: 'text', description: 'text' }, options: { name: 'org_text_search' } }
    ],

    // Organization members
    organization_members: [
      { fields: { organizationId: 1, userId: 1 }, options: { unique: true } },
      { fields: { organizationId: 1, role: 1 } },
      { fields: { userId: 1, isActive: 1 } },
      { fields: { invitedBy: 1 } }
    ],

    // Organization invitations
    organization_invitations: [
      { fields: { organizationId: 1, email: 1 }, options: { unique: true } },
      { fields: { token: 1 }, options: { unique: true } },
      { fields: { status: 1, expiresAt: 1 } },
      { fields: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } }
    ],

    // Tenants
    tenants: [
      { fields: { organizationId: 1, isActive: 1 } },
      { fields: { domain: 1 }, options: { unique: true, sparse: true } },
      { fields: { databaseName: 1 }, options: { unique: true } },
      { fields: { createdAt: -1 } }
    ],

    // Subscriptions
    subscriptions: [
      { fields: { organizationId: 1 }, options: { unique: true } },
      { fields: { planId: 1, status: 1 } },
      { fields: { currentPeriodEnd: 1 } },
      { fields: { canceledAt: 1 } },
      { fields: { trialEnd: 1 } }
    ],

    // Subscription plans
    subscription_plans: [
      { fields: { code: 1 }, options: { unique: true } },
      { fields: { isActive: 1, isPublic: 1 } },
      { fields: { 'pricing.interval': 1, 'pricing.amount': 1 } }
    ],

    // Invoices
    invoices: [
      { fields: { organizationId: 1, createdAt: -1 } },
      { fields: { invoiceNumber: 1 }, options: { unique: true } },
      { fields: { status: 1, dueDate: 1 } },
      { fields: { subscriptionId: 1 } }
    ],

    // Payments
    payments: [
      { fields: { organizationId: 1, createdAt: -1 } },
      { fields: { invoiceId: 1 } },
      { fields: { status: 1 } },
      { fields: { 'paymentMethod.type': 1 } },
      { fields: { transactionId: 1 }, options: { unique: true, sparse: true } }
    ],

    // Payment methods
    payment_methods: [
      { fields: { organizationId: 1, isActive: 1 } },
      { fields: { type: 1, isDefault: 1 } },
      { fields: { 'card.last4': 1 } }
    ],

    // Credit transactions
    credit_transactions: [
      { fields: { organizationId: 1, createdAt: -1 } },
      { fields: { type: 1, status: 1 } },
      { fields: { referenceType: 1, referenceId: 1 } }
    ],

    // Usage records
    usage_records: [
      { fields: { organizationId: 1, recordDate: -1 } },
      { fields: { metricType: 1, recordDate: -1 } },
      { fields: { subscriptionId: 1, recordDate: -1 } }
    ],

    // Audit logs
    audit_logs: [
      { fields: { userId: 1, createdAt: -1 } },
      { fields: { organizationId: 1, createdAt: -1 } },
      { fields: { action: 1, createdAt: -1 } },
      { fields: { 'resource.type': 1, 'resource.id': 1 } },
      { fields: { severity: 1, createdAt: -1 } },
      { fields: { createdAt: 1 }, options: { expireAfterSeconds: 31536000 } } // 1 year
    ],

    // Audit alerts
    audit_alerts: [
      { fields: { organizationId: 1, status: 1 } },
      { fields: { type: 1, severity: 1 } },
      { fields: { acknowledgedBy: 1 } },
      { fields: { createdAt: -1 } }
    ],

    // Security incidents
    security_incidents: [
      { fields: { organizationId: 1, createdAt: -1 } },
      { fields: { type: 1, severity: 1, status: 1 } },
      { fields: { affectedUserId: 1 } },
      { fields: { resolvedAt: 1 } }
    ],

    // API usage
    api_usage: [
      { fields: { organizationId: 1, timestamp: -1 } },
      { fields: { apiKey: 1, timestamp: -1 } },
      { fields: { endpoint: 1, method: 1 } },
      { fields: { statusCode: 1 } },
      { fields: { timestamp: 1 }, options: { expireAfterSeconds: 2592000 } } // 30 days
    ],

    // Notifications
    notifications: [
      { fields: { recipientId: 1, createdAt: -1 } },
      { fields: { recipientId: 1, isRead: 1, createdAt: -1 } },
      { fields: { type: 1, status: 1 } },
      { fields: { organizationId: 1, createdAt: -1 } },
      { fields: { scheduledFor: 1 } }
    ],

    // Webhooks
    webhooks: [
      { fields: { organizationId: 1, isActive: 1 } },
      { fields: { events: 1 } },
      { fields: { lastTriggeredAt: -1 } }
    ],

    // Permissions
    permissions: [
      { fields: { code: 1 }, options: { unique: true } },
      { fields: { resource: 1, action: 1 } },
      { fields: { category: 1 } }
    ],

    // Roles
    roles: [
      { fields: { organizationId: 1, name: 1 }, options: { unique: true } },
      { fields: { isSystem: 1 } },
      { fields: { permissions: 1 } }
    ],

    // System configurations
    system_configurations: [
      { fields: { key: 1 }, options: { unique: true } },
      { fields: { category: 1 } },
      { fields: { isPublic: 1 } }
    ],

    // Migration history (for this system)
    migration_history: [
      { fields: { name: 1 }, options: { unique: true } },
      { fields: { status: 1, executedAt: -1 } }
    ]
  };

  /**
   * Applies the migration - creates all indexes
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {AppError} If migration fails
   */
  static async up() {
    const startTime = Date.now();
    let createdIndexes = 0;
    let skippedIndexes = 0;

    try {
      logger.info('Starting index creation migration');

      const connection = ConnectionManager.getConnection();
      if (!connection) {
        throw new AppError('No database connection available', 500, 'NO_CONNECTION');
      }

      const db = connection.db;

      // Process each collection
      for (const [collectionName, indexes] of Object.entries(CreateIndexesMigration.#INDEX_DEFINITIONS)) {
        logger.info(`Processing indexes for collection: ${collectionName}`);

        // Ensure collection exists
        const collections = await db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) {
          await db.createCollection(collectionName);
          logger.info(`Created collection: ${collectionName}`);
        }

        const collection = db.collection(collectionName);

        // Get existing indexes
        const existingIndexes = await collection.indexes();
        const existingIndexMap = new Map(
          existingIndexes.map(idx => [JSON.stringify(idx.key), idx])
        );

        // Create each index
        for (const indexDef of indexes) {
          const indexKey = JSON.stringify(indexDef.fields);

          // Check if index already exists
          if (existingIndexMap.has(indexKey)) {
            logger.debug(`Index already exists on ${collectionName}:`, indexDef.fields);
            skippedIndexes++;
            continue;
          }

          try {
            const indexName = await collection.createIndex(
              indexDef.fields,
              {
                background: true,
                ...indexDef.options
              }
            );

            logger.info(`Created index on ${collectionName}:`, {
              fields: indexDef.fields,
              name: indexName
            });

            createdIndexes++;

          } catch (error) {
            // Handle duplicate key errors gracefully
            if (error.code === 11000 || error.code === 11001) {
              logger.warn(`Duplicate key error creating index on ${collectionName}:`, {
                fields: indexDef.fields,
                error: error.message
              });
              skippedIndexes++;
            } else {
              throw error;
            }
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Index creation migration completed', {
        duration,
        createdIndexes,
        skippedIndexes,
        totalCollections: Object.keys(CreateIndexesMigration.#INDEX_DEFINITIONS).length
      });

    } catch (error) {
      logger.error('Index creation migration failed', error);
      throw new AppError(
        'Failed to create database indexes',
        500,
        'INDEX_CREATION_ERROR',
        { 
          originalError: error.message,
          createdIndexes,
          skippedIndexes
        }
      );
    }
  }

  /**
   * Rolls back the migration - removes created indexes
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {AppError} If rollback fails
   */
  static async down() {
    const startTime = Date.now();
    let droppedIndexes = 0;

    try {
      logger.info('Starting index removal rollback');

      const connection = ConnectionManager.getConnection();
      if (!connection) {
        throw new AppError('No database connection available', 500, 'NO_CONNECTION');
      }

      const db = connection.db;

      // Process each collection
      for (const [collectionName, indexes] of Object.entries(CreateIndexesMigration.#INDEX_DEFINITIONS)) {
        logger.info(`Processing index removal for collection: ${collectionName}`);

        // Check if collection exists
        const collections = await db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) {
          logger.debug(`Collection ${collectionName} does not exist, skipping`);
          continue;
        }

        const collection = db.collection(collectionName);

        // Get existing indexes
        const existingIndexes = await collection.indexes();

        // Drop each non-_id index that matches our definitions
        for (const indexDef of indexes) {
          const matchingIndex = existingIndexes.find(idx => {
            return JSON.stringify(idx.key) === JSON.stringify(indexDef.fields);
          });

          if (matchingIndex && matchingIndex.name !== '_id_') {
            try {
              await collection.dropIndex(matchingIndex.name);
              logger.info(`Dropped index on ${collectionName}:`, {
                fields: indexDef.fields,
                name: matchingIndex.name
              });
              droppedIndexes++;

            } catch (error) {
              logger.warn(`Failed to drop index on ${collectionName}:`, {
                fields: indexDef.fields,
                error: error.message
              });
            }
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Index removal rollback completed', {
        duration,
        droppedIndexes
      });

    } catch (error) {
      logger.error('Index removal rollback failed', error);
      throw new AppError(
        'Failed to remove database indexes',
        500,
        'INDEX_REMOVAL_ERROR',
        {
          originalError: error.message,
          droppedIndexes
        }
      );
    }
  }

  /**
   * Validates index creation
   * @static
   * @async
   * @returns {Promise<Object>} Validation results
   */
  static async validate() {
    try {
      const connection = ConnectionManager.getConnection();
      if (!connection) {
        throw new AppError('No database connection available', 500, 'NO_CONNECTION');
      }

      const db = connection.db;
      const results = {
        valid: true,
        collections: {},
        errors: []
      };

      // Check each collection
      for (const [collectionName, expectedIndexes] of Object.entries(CreateIndexesMigration.#INDEX_DEFINITIONS)) {
        const collection = db.collection(collectionName);
        
        try {
          const existingIndexes = await collection.indexes();
          const existingIndexMap = new Map(
            existingIndexes.map(idx => [JSON.stringify(idx.key), idx])
          );

          const collectionResult = {
            expectedCount: expectedIndexes.length,
            actualCount: existingIndexes.length - 1, // Exclude _id index
            missingIndexes: []
          };

          // Check for missing indexes
          for (const indexDef of expectedIndexes) {
            const indexKey = JSON.stringify(indexDef.fields);
            if (!existingIndexMap.has(indexKey)) {
              collectionResult.missingIndexes.push(indexDef.fields);
              results.valid = false;
            }
          }

          results.collections[collectionName] = collectionResult;

        } catch (error) {
          results.errors.push({
            collection: collectionName,
            error: error.message
          });
          results.valid = false;
        }
      }

      return results;

    } catch (error) {
      logger.error('Index validation failed', error);
      throw new AppError(
        'Failed to validate indexes',
        500,
        'INDEX_VALIDATION_ERROR',
        { originalError: error.message }
      );
    }
  }
}

module.exports = CreateIndexesMigration;