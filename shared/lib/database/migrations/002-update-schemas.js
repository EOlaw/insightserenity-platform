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
const AppError = require('../../utils/app-error');
const ConnectionManager = require('../connection-manager');
const SchemaValidator = require('../validators/schema-validator');
const { USER_STATUS, ORGANIZATION_STATUS } = require('../../utils/constants/status-codes');

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

      // Process each collection
      for (const [collectionName, updates] of Object.entries(UpdateSchemasMigration.#SCHEMA_UPDATES)) {
        logger.info(`Processing schema updates for collection: ${collectionName}`);

        try {
          // Ensure collection exists
          const collections = await db.listCollections({ name: collectionName }).toArray();
          if (collections.length === 0) {
            logger.warn(`Collection ${collectionName} does not exist, skipping`);
            continue;
          }

          const collection = db.collection(collectionName);

          // Add new fields
          if (updates.fields && updates.fields.length > 0) {
            for (const field of updates.fields) {
              const updateResult = await UpdateSchemasMigration.#addFieldToDocuments(
                collection,
                field.name,
                field.defaultValue,
                field.description
              );

              stats.documentsUpdated += updateResult.modifiedCount;
              stats.fieldsAdded++;

              logger.info(`Added field ${field.name} to ${collectionName}`, {
                documentsUpdated: updateResult.modifiedCount
              });
            }
          }

          // Apply restructuring if defined
          if (updates.restructure) {
            const restructureResult = await UpdateSchemasMigration.#restructureDocuments(
              collection,
              updates.restructure
            );

            stats.documentsUpdated += restructureResult.modifiedCount;

            logger.info(`Restructured documents in ${collectionName}`, {
              documentsUpdated: restructureResult.modifiedCount
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
              errors: validationResult.errors
            });
          }

        } catch (error) {
          logger.error(`Failed to update collection ${collectionName}`, error);
          stats.errors.push({
            collection: collectionName,
            error: error.message
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
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to update database schemas',
        500,
        'SCHEMA_UPDATE_ERROR',
        {
          originalError: error.message,
          stats
        }
      );
    }
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
          const collections = await db.listCollections({ name: collectionName }).toArray();
          if (collections.length === 0) {
            continue;
          }

          const collection = db.collection(collectionName);

          // Remove added fields
          if (updates.fields && updates.fields.length > 0) {
            const fieldsToRemove = {};
            updates.fields.forEach(field => {
              fieldsToRemove[field.name] = '';
            });

            const updateResult = await collection.updateMany(
              {},
              { $unset: fieldsToRemove }
            );

            stats.documentsUpdated += updateResult.modifiedCount;
            stats.fieldsRemoved += updates.fields.length;

            logger.info(`Removed fields from ${collectionName}`, {
              fieldsRemoved: updates.fields.length,
              documentsUpdated: updateResult.modifiedCount
            });
          }

          // Note: Restructuring rollback would require storing original structure
          // This is not implemented to avoid data loss

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
      throw new AppError(
        'Failed to rollback schema updates',
        500,
        'SCHEMA_ROLLBACK_ERROR',
        {
          originalError: error.message,
          stats
        }
      );
    }
  }

  /**
   * @private
   * Adds a field to all documents in a collection
   * @static
   * @async
   * @param {Object} collection - MongoDB collection
   * @param {string} fieldName - Field name to add
   * @param {*} defaultValue - Default value for the field
   * @param {string} description - Field description
   * @returns {Promise<Object>} Update result
   */
  static async #addFieldToDocuments(collection, fieldName, defaultValue, description) {
    try {
      // Only update documents that don't have the field
      const filter = { [fieldName]: { $exists: false } };
      const update = { $set: { [fieldName]: defaultValue } };

      const result = await collection.updateMany(filter, update);

      // Add field metadata as a comment (if supported)
      try {
        await collection.updateMany(
          {},
          { $comment: `Added field: ${fieldName} - ${description}` }
        );
      } catch (error) {
        // Comments might not be supported, ignore
      }

      return result;

    } catch (error) {
      logger.error(`Failed to add field ${fieldName}`, error);
      throw error;
    }
  }

  /**
   * @private
   * Restructures documents according to specification
   * @static
   * @async
   * @param {Object} collection - MongoDB collection
   * @param {Object} restructureSpec - Restructuring specification
   * @returns {Promise<Object>} Update result
   */
  static async #restructureDocuments(collection, restructureSpec) {
    try {
      const pipeline = [];

      // Build aggregation pipeline for restructuring
      for (const [path, structure] of Object.entries(restructureSpec)) {
        const pathParts = path.split('.');
        
        // Create nested structure
        let setOperation = { $set: {} };
        let current = setOperation.$set;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
          current[pathParts[i]] = {};
          current = current[pathParts[i]];
        }
        
        current[pathParts[pathParts.length - 1]] = structure;
        pipeline.push(setOperation);
      }

      // Add merge operation
      pipeline.push({
        $merge: {
          into: collection.collectionName,
          whenMatched: 'merge',
          whenNotMatched: 'fail'
        }
      });

      // Execute aggregation pipeline
      await collection.aggregate(pipeline).toArray();

      // Get count of documents
      const count = await collection.countDocuments();

      return { modifiedCount: count };

    } catch (error) {
      logger.error('Failed to restructure documents', error);
      throw error;
    }
  }

  /**
   * @private
   * Validates collection schema
   * @static
   * @async
   * @param {Object} collection - MongoDB collection
   * @param {string} collectionName - Collection name
   * @returns {Promise<Object>} Validation result
   */
  static async #validateCollection(collection, collectionName) {
    try {
      const sampleSize = 100;
      const documents = await collection.find({}).limit(sampleSize).toArray();

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
        const documentsWithField = documents.filter(doc => 
          doc.hasOwnProperty(field.name)
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
      if (SchemaValidator && SchemaValidator.validateCollection) {
        const schemaValidation = await SchemaValidator.validateCollection(
          collectionName,
          documents
        );

        if (!schemaValidation.valid) {
          validationResult.valid = false;
          validationResult.errors.push(...schemaValidation.errors);
        }
      }

      return validationResult;

    } catch (error) {
      logger.error(`Failed to validate collection ${collectionName}`, error);
      return {
        valid: false,
        errors: [error.message],
        warnings: []
      };
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
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        
        stats.collections[collectionName] = {
          documentCount: count,
          expectedFields: UpdateSchemasMigration.#SCHEMA_UPDATES[collectionName].fields.length
        };
      }

      return stats;

    } catch (error) {
      logger.error('Failed to get migration statistics', error);
      throw new AppError(
        'Failed to retrieve migration statistics',
        500,
        'STATS_ERROR',
        { originalError: error.message }
      );
    }
  }
}

module.exports = UpdateSchemasMigration;