'use strict';

/**
 * @fileoverview Updates database schemas with new fields and structural improvements
 * @module shared/lib/database/migrations/002-update-schemas
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/database/validators/schema-validator
 * @requires module:shared/lib/utils/constants/status-codes
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const ConnectionManager = require('../connection-manager');

// Safe imports with fallbacks
let SchemaValidator;
let USER_STATUS, ORGANIZATION_STATUS;

try {
  SchemaValidator = require('../validators/schema-validator');
} catch (error) {
  logger.warn('SchemaValidator not available, validation will be limited');
  SchemaValidator = null;
}

try {
  const statusCodes = require('../../utils/constants/status-codes');
  USER_STATUS = statusCodes.USER_STATUS || {};
  ORGANIZATION_STATUS = statusCodes.ORGANIZATION_STATUS || {};
} catch (error) {
  logger.warn('Status codes not available, using defaults');
  USER_STATUS = {};
  ORGANIZATION_STATUS = {};
}

/**
 * @class UpdateSchemasMigration
 * @description Updates existing database schemas with new fields and improved structure
 */
class UpdateSchemasMigration {
  /**
   * @private
   * @static
   * @readonly
   */
  static #SCHEMA_UPDATES = {
    // User collection updates
    users: {
      fields: [
        {
          name: 'lastLogin',
          defaultValue: null,
          description: 'Track last login timestamp'
        },
        {
          name: 'isActive',
          defaultValue: true,
          description: 'User active status'
        },
        {
          name: 'accountLocked',
          defaultValue: false,
          description: 'Account lock status'
        },
        {
          name: 'lockReason',
          defaultValue: null,
          description: 'Reason for account lock'
        },
        {
          name: 'failedLoginAttempts',
          defaultValue: 0,
          description: 'Failed login counter'
        },
        {
          name: 'passwordChangedAt',
          defaultValue: null,
          description: 'Last password change timestamp'
        },
        {
          name: 'requirePasswordChange',
          defaultValue: false,
          description: 'Force password change on next login'
        },
        {
          name: 'searchKeywords',
          defaultValue: [],
          description: 'Search optimization keywords'
        },
        {
          name: 'metadata',
          defaultValue: {},
          description: 'Flexible metadata storage'
        }
      ],
      restructure: {
        'settings.notifications': {
          email: true,
          sms: false,
          push: true,
          inApp: true
        },
        'settings.privacy': {
          profileVisibility: 'organization',
          showEmail: false,
          showPhone: false
        }
      }
    },

    // Organization collection updates
    organizations: {
      fields: [
        {
          name: 'industry',
          defaultValue: null,
          description: 'Organization industry type'
        },
        {
          name: 'size',
          defaultValue: null,
          description: 'Organization size category'
        },
        {
          name: 'taxId',
          defaultValue: null,
          description: 'Tax identification number'
        },
        {
          name: 'billingEmail',
          defaultValue: null,
          description: 'Dedicated billing email'
        },
        {
          name: 'technicalContactEmail',
          defaultValue: null,
          description: 'Technical contact email'
        },
        {
          name: 'features',
          defaultValue: {},
          description: 'Enabled feature flags'
        },
        {
          name: 'customDomain',
          defaultValue: null,
          description: 'Custom domain configuration'
        },
        {
          name: 'branding',
          defaultValue: {
            primaryColor: null,
            logo: null,
            favicon: null
          },
          description: 'Custom branding settings'
        },
        {
          name: 'integrations',
          defaultValue: [],
          description: 'Third-party integrations'
        },
        {
          name: 'dataRetentionDays',
          defaultValue: 365,
          description: 'Data retention policy in days'
        }
      ]
    },

    // Subscription collection updates
    subscriptions: {
      fields: [
        {
          name: 'addons',
          defaultValue: [],
          description: 'Subscription addons'
        },
        {
          name: 'discounts',
          defaultValue: [],
          description: 'Applied discounts'
        },
        {
          name: 'renewalReminders',
          defaultValue: {
            sent: [],
            nextReminderDate: null
          },
          description: 'Renewal reminder tracking'
        },
        {
          name: 'usageLimits',
          defaultValue: {},
          description: 'Custom usage limits'
        },
        {
          name: 'billingCycle',
          defaultValue: 'monthly',
          description: 'Billing cycle preference'
        },
        {
          name: 'autoRenew',
          defaultValue: true,
          description: 'Auto-renewal preference'
        }
      ]
    },

    // Tenant collection updates
    tenants: {
      fields: [
        {
          name: 'isolationLevel',
          defaultValue: 'database',
          description: 'Data isolation level'
        },
        {
          name: 'resourceLimits',
          defaultValue: {
            maxUsers: null,
            maxStorage: null,
            maxApiCalls: null
          },
          description: 'Tenant resource limitations'
        },
        {
          name: 'customizations',
          defaultValue: {},
          description: 'Tenant-specific customizations'
        },
        {
          name: 'maintenanceWindow',
          defaultValue: {
            dayOfWeek: 0, // Sunday
            hour: 2, // 2 AM
            duration: 2 // hours
          },
          description: 'Preferred maintenance window'
        }
      ]
    },

    // Audit log collection updates
    audit_logs: {
      fields: [
        {
          name: 'risk_score',
          defaultValue: 0,
          description: 'Risk assessment score'
        },
        {
          name: 'tags',
          defaultValue: [],
          description: 'Categorization tags'
        },
        {
          name: 'correlationId',
          defaultValue: null,
          description: 'Request correlation ID'
        },
        {
          name: 'retention',
          defaultValue: {
            required: false,
            reason: null,
            until: null
          },
          description: 'Special retention requirements'
        }
      ]
    },

    // User session collection updates
    user_sessions: {
      fields: [
        {
          name: 'deviceFingerprint',
          defaultValue: null,
          description: 'Device identification'
        },
        {
          name: 'geoLocation',
          defaultValue: {
            country: null,
            region: null,
            city: null,
            coordinates: null
          },
          description: 'Geographic location data'
        },
        {
          name: 'securityFlags',
          defaultValue: {
            suspicious: false,
            mfaRequired: false,
            elevated: false
          },
          description: 'Security status flags'
        }
      ]
    },

    // API usage collection updates
    api_usage: {
      fields: [
        {
          name: 'cost',
          defaultValue: 0,
          description: 'Calculated API call cost'
        },
        {
          name: 'rateLimitInfo',
          defaultValue: {
            limit: null,
            remaining: null,
            reset: null
          },
          description: 'Rate limit information'
        },
        {
          name: 'performance',
          defaultValue: {
            serverTime: null,
            dbTime: null,
            totalTime: null
          },
          description: 'Performance metrics'
        }
      ]
    }
  };

  static #OPERATION_TIMEOUT = 120000; // 2 minutes
  static #RETRY_ATTEMPTS = 3;
  static #RETRY_DELAY = 5000;
  static #BATCH_SIZE = 500;

  /**
   * Applies the migration - updates schemas with new fields
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {AppError} If migration fails
   */
  static async up() {
    const startTime = Date.now();
    const stats = {
      collectionsUpdated: 0,
      fieldsAdded: 0,
      documentsUpdated: 0,
      errors: []
    };

    try {
      logger.info('Starting schema update migration');

      const connection = ConnectionManager.getConnection();
      if (!connection) {
        throw new AppError('No database connection available', 500, 'NO_CONNECTION');
      }

      const db = connection.db;

      // Process each collection with enhanced error handling
      for (const [collectionName, updates] of Object.entries(UpdateSchemasMigration.#SCHEMA_UPDATES)) {
        logger.info(`Processing schema updates for collection: ${collectionName}`);

        try {
          // Ensure collection exists
          const collectionExists = await UpdateSchemasMigration.#ensureCollectionExists(db, collectionName);
          
          if (!collectionExists) {
            logger.warn(`Collection ${collectionName} does not exist, skipping`);
            continue;
          }

          const collection = db.collection(collectionName);

          // Add new fields with error handling
          if (updates.fields && Array.isArray(updates.fields) && updates.fields.length > 0) {
            for (const field of updates.fields) {
              if (!field || !field.name) {
                logger.warn(`Invalid field definition in ${collectionName}:`, field);
                continue;
              }

              const updateResult = await UpdateSchemasMigration.#addFieldToDocuments(
                collection,
                field.name,
                field.defaultValue,
                field.description
              );

              stats.documentsUpdated += updateResult.modifiedCount || 0;
              stats.fieldsAdded++;

              logger.info(`Added field ${field.name} to ${collectionName}`, {
                documentsUpdated: updateResult.modifiedCount || 0
              });
            }
          }

          // Apply restructuring if defined
          if (updates.restructure && typeof updates.restructure === 'object') {
            const restructureResult = await UpdateSchemasMigration.#restructureDocuments(
              collection,
              updates.restructure
            );

            stats.documentsUpdated += restructureResult.modifiedCount || 0;

            logger.info(`Restructured documents in ${collectionName}`, {
              documentsUpdated: restructureResult.modifiedCount || 0
            });
          }

          stats.collectionsUpdated++;

          // Validate schema after updates
          const validationResult = await UpdateSchemasMigration.#validateCollection(
            collection,
            collectionName
          );

          if (!validationResult.valid) {
            stats.errors.push({
              collection: collectionName,
              errors: validationResult.errors || []
            });
          }

        } catch (error) {
          logger.error(`Failed to update collection ${collectionName}`, error);
          stats.errors.push({
            collection: collectionName,
            error: error && error.message ? error.message : 'Unknown error'
          });
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Schema update migration completed', {
        duration,
        ...stats
      });

      if (stats.errors.length > 0) {
        throw new AppError(
          'Schema update completed with errors',
          500,
          'SCHEMA_UPDATE_PARTIAL_ERROR',
          { errors: stats.errors }
        );
      }

    } catch (error) {
      logger.error('Schema update migration failed', error);
      
      if (error && error.name === 'AppError') {
        throw error;
      }

      const errorMessage = error && error.message ? error.message : 'Unknown error';

      throw new AppError(
        'Failed to update database schemas',
        500,
        'SCHEMA_UPDATE_ERROR',
        {
          originalError: errorMessage,
          stats
        }
      );
    }
  }

  /**
   * @private
   * Ensures collection exists with timeout protection
   * @static
   * @async
   * @param {Object} db - Database instance
   * @param {string} collectionName - Collection name
   * @returns {Promise<boolean>} Whether collection exists or was created
   */
  static async #ensureCollectionExists(db, collectionName) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Collection existence check timed out for: ${collectionName}`));
      }, UpdateSchemasMigration.#OPERATION_TIMEOUT);

      try {
        const collections = await db.listCollections({ name: collectionName }).toArray();
        clearTimeout(timeout);
        resolve(collections.length > 0);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * @private
   * Adds a field to all documents in a collection with enhanced error handling
   * @static
   * @async
   * @param {Object} collection - MongoDB collection
   * @param {string} fieldName - Field name to add
   * @param {*} defaultValue - Default value for the field
   * @param {string} description - Field description
   * @returns {Promise<Object>} Update result
   */
  static async #addFieldToDocuments(collection, fieldName, defaultValue, description) {
    let lastError;

    for (let attempt = 1; attempt <= UpdateSchemasMigration.#RETRY_ATTEMPTS; attempt++) {
      try {
        // Only update documents that don't have the field
        const filter = { [fieldName]: { $exists: false } };
        const update = { $set: { [fieldName]: defaultValue } };

        // Process in batches to avoid memory issues
        const totalDocs = await collection.countDocuments(filter);
        
        if (totalDocs === 0) {
          return { modifiedCount: 0 };
        }

        let totalModified = 0;
        let skip = 0;

        while (skip < totalDocs) {
          const batchFilter = {
            ...filter,
            _id: {
              $in: await collection
                .find(filter, { projection: { _id: 1 } })
                .skip(skip)
                .limit(UpdateSchemasMigration.#BATCH_SIZE)
                .map(doc => doc._id)
                .toArray()
            }
          };

          const result = await collection.updateMany(batchFilter, update);
          totalModified += result.modifiedCount || 0;
          skip += UpdateSchemasMigration.#BATCH_SIZE;

          // Log progress for large collections
          if (totalDocs > UpdateSchemasMigration.#BATCH_SIZE) {
            logger.debug(`Progress for ${fieldName}: ${Math.min(skip, totalDocs)}/${totalDocs} documents processed`);
          }
        }

        // Add field metadata comment if supported
        try {
          await collection.updateMany(
            {},
            { $comment: `Added field: ${fieldName} - ${description}` }
          );
        } catch (commentError) {
          // Comments might not be supported, ignore
          logger.debug('Field comment not supported, skipping');
        }

        return { modifiedCount: totalModified };

      } catch (error) {
        lastError = error;
        
        if (attempt < UpdateSchemasMigration.#RETRY_ATTEMPTS) {
          logger.warn(`Failed to add field ${fieldName} (attempt ${attempt}), retrying...`, error.message);
          await UpdateSchemasMigration.#delay(UpdateSchemasMigration.#RETRY_DELAY * attempt);
        }
      }
    }

    logger.error(`Failed to add field ${fieldName} after all retries`, lastError);
    throw lastError;
  }

  /**
   * @private
   * Restructures documents according to specification with enhanced error handling
   * @static
   * @async
   * @param {Object} collection - MongoDB collection
   * @param {Object} restructureSpec - Restructuring specification
   * @returns {Promise<Object>} Update result
   */
  static async #restructureDocuments(collection, restructureSpec) {
    if (!restructureSpec || typeof restructureSpec !== 'object') {
      return { modifiedCount: 0 };
    }

    let lastError;

    for (let attempt = 1; attempt <= UpdateSchemasMigration.#RETRY_ATTEMPTS; attempt++) {
      try {
        // Build update operation for restructuring
        const updateOperation = { $set: {} };
        
        for (const [path, structure] of Object.entries(restructureSpec)) {
          if (path && structure !== undefined) {
            updateOperation.$set[path] = structure;
          }
        }

        if (Object.keys(updateOperation.$set).length === 0) {
          return { modifiedCount: 0 };
        }

        // Apply restructuring in batches
        const totalDocs = await collection.countDocuments({});
        let totalModified = 0;
        let skip = 0;

        while (skip < totalDocs) {
          const batchDocs = await collection
            .find({}, { projection: { _id: 1 } })
            .skip(skip)
            .limit(UpdateSchemasMigration.#BATCH_SIZE)
            .toArray();

          if (batchDocs.length === 0) break;

          const batchIds = batchDocs.map(doc => doc._id);
          const result = await collection.updateMany(
            { _id: { $in: batchIds } },
            updateOperation
          );

          totalModified += result.modifiedCount || 0;
          skip += UpdateSchemasMigration.#BATCH_SIZE;

          // Log progress for large collections
          if (totalDocs > UpdateSchemasMigration.#BATCH_SIZE) {
            logger.debug(`Restructure progress: ${Math.min(skip, totalDocs)}/${totalDocs} documents processed`);
          }
        }

        return { modifiedCount: totalModified };

      } catch (error) {
        lastError = error;
        
        if (attempt < UpdateSchemasMigration.#RETRY_ATTEMPTS) {
          logger.warn(`Failed to restructure documents (attempt ${attempt}), retrying...`, error.message);
          await UpdateSchemasMigration.#delay(UpdateSchemasMigration.#RETRY_DELAY * attempt);
        }
      }
    }

    logger.error('Failed to restructure documents after all retries', lastError);
    throw lastError;
  }

  /**
   * @private
   * Validates collection schema with enhanced error handling
   * @static
   * @async
   * @param {Object} collection - MongoDB collection
   * @param {string} collectionName - Collection name
   * @returns {Promise<Object>} Validation result
   */
  static async #validateCollection(collection, collectionName) {
    try {
      const sampleSize = 100;
      let documents = [];
      
      try {
        documents = await collection.find({}).limit(sampleSize).toArray();
      } catch (error) {
        logger.warn(`Failed to fetch documents for validation from ${collectionName}`, error.message);
        return {
          valid: false,
          errors: [`Failed to fetch documents: ${error.message}`],
          warnings: []
        };
      }

      const validationResult = {
        valid: true,
        errors: [],
        warnings: []
      };

      if (documents.length === 0) {
        validationResult.warnings.push('No documents to validate');
        return validationResult;
      }

      // Check expected fields exist
      const expectedFields = UpdateSchemasMigration.#SCHEMA_UPDATES[collectionName]?.fields || [];
      
      for (const field of expectedFields) {
        if (!field || !field.name) continue;

        const documentsWithField = documents.filter(doc => 
          doc && doc.hasOwnProperty(field.name)
        ).length;

        if (documentsWithField === 0) {
          validationResult.errors.push(`Field ${field.name} not found in any documents`);
          validationResult.valid = false;
        } else if (documentsWithField < documents.length) {
          validationResult.warnings.push(
            `Field ${field.name} found in ${documentsWithField}/${documents.length} documents`
          );
        }
      }

      // Use SchemaValidator if available
      if (SchemaValidator && typeof SchemaValidator.validateCollection === 'function') {
        try {
          const schemaValidation = await SchemaValidator.validateCollection(
            collectionName,
            documents
          );

          if (schemaValidation && !schemaValidation.valid) {
            validationResult.valid = false;
            if (Array.isArray(schemaValidation.errors)) {
              validationResult.errors.push(...schemaValidation.errors);
            }
          }
        } catch (schemaError) {
          logger.warn(`Schema validation failed for ${collectionName}`, schemaError.message);
          validationResult.warnings.push(`Schema validation unavailable: ${schemaError.message}`);
        }
      }

      return validationResult;

    } catch (error) {
      logger.error(`Failed to validate collection ${collectionName}`, error);
      return {
        valid: false,
        errors: [error && error.message ? error.message : 'Unknown validation error'],
        warnings: []
      };
    }
  }

  /**
   * @private
   * Delays execution
   * @static
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  static async #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Rolls back the migration - removes added fields
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {AppError} If rollback fails
   */
  static async down() {
    const startTime = Date.now();
    const stats = {
      collectionsReverted: 0,
      fieldsRemoved: 0,
      documentsUpdated: 0
    };

    try {
      logger.info('Starting schema update rollback');

      const connection = ConnectionManager.getConnection();
      if (!connection) {
        throw new AppError('No database connection available', 500, 'NO_CONNECTION');
      }

      const db = connection.db;

      // Process each collection
      for (const [collectionName, updates] of Object.entries(UpdateSchemasMigration.#SCHEMA_UPDATES)) {
        logger.info(`Rolling back schema updates for collection: ${collectionName}`);

        try {
          const collectionExists = await UpdateSchemasMigration.#ensureCollectionExists(db, collectionName);
          if (!collectionExists) {
            continue;
          }

          const collection = db.collection(collectionName);

          // Remove added fields
          if (updates.fields && Array.isArray(updates.fields) && updates.fields.length > 0) {
            const fieldsToRemove = {};
            updates.fields.forEach(field => {
              if (field && field.name) {
                fieldsToRemove[field.name] = '';
              }
            });

            if (Object.keys(fieldsToRemove).length > 0) {
              const updateResult = await collection.updateMany(
                {},
                { $unset: fieldsToRemove }
              );

              stats.documentsUpdated += updateResult.modifiedCount || 0;
              stats.fieldsRemoved += Object.keys(fieldsToRemove).length;

              logger.info(`Removed fields from ${collectionName}`, {
                fieldsRemoved: Object.keys(fieldsToRemove).length,
                documentsUpdated: updateResult.modifiedCount || 0
              });
            }
          }

          stats.collectionsReverted++;

        } catch (error) {
          logger.error(`Failed to rollback collection ${collectionName}`, error);
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Schema update rollback completed', {
        duration,
        ...stats
      });

    } catch (error) {
      logger.error('Schema update rollback failed', error);
      
      const errorMessage = error && error.message ? error.message : 'Unknown error';
      
      throw new AppError(
        'Failed to rollback schema updates',
        500,
        'SCHEMA_ROLLBACK_ERROR',
        {
          originalError: errorMessage,
          stats
        }
      );
    }
  }

  /**
   * Gets migration statistics
   * @static
   * @async
   * @returns {Promise<Object>} Migration statistics
   */
  static async getStatistics() {
    try {
      const connection = ConnectionManager.getConnection();
      if (!connection) {
        throw new AppError('No database connection available', 500, 'NO_CONNECTION');
      }

      const db = connection.db;
      const stats = {
        collections: {}
      };

      for (const collectionName of Object.keys(UpdateSchemasMigration.#SCHEMA_UPDATES)) {
        try {
          const collection = db.collection(collectionName);
          const count = await collection.countDocuments();
          
          stats.collections[collectionName] = {
            documentCount: count,
            expectedFields: (UpdateSchemasMigration.#SCHEMA_UPDATES[collectionName].fields || []).length
          };
        } catch (error) {
          logger.warn(`Failed to get statistics for ${collectionName}`, error.message);
          stats.collections[collectionName] = {
            documentCount: 0,
            expectedFields: 0,
            error: error.message
          };
        }
      }

      return stats;

    } catch (error) {
      logger.error('Failed to get migration statistics', error);
      
      const errorMessage = error && error.message ? error.message : 'Unknown error';
      
      throw new AppError(
        'Failed to retrieve migration statistics',
        500,
        'STATS_ERROR',
        { originalError: errorMessage }
      );
    }
  }
}

module.exports = UpdateSchemasMigration;