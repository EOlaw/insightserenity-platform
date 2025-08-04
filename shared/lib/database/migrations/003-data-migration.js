'use strict';

/**
 * @fileoverview Performs data transformations and migrations for existing records
 * @module shared/lib/database/migrations/003-data-migration
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/connection-manager
 * @requires module:shared/lib/database/transaction-manager
 * @requires module:shared/lib/database/validators/data-validator
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:shared/lib/utils/constants/roles
 * @requires module:shared/lib/utils/constants/permissions
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const ConnectionManager = require('../connection-manager');
const TransactionManager = require('../transaction-manager');

// Safe imports with fallbacks for optional dependencies
let DataValidator;
let CryptoHelper;
let SYSTEM_ROLES = {};
let DEFAULT_ROLES = {};
let PERMISSIONS = {};

try {
  DataValidator = require('../validators/data-validator');
} catch (error) {
  logger.warn('DataValidator not available, email validation will be limited');
  DataValidator = {
    isValidEmail: (email) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }
  };
}

try {
  CryptoHelper = require('../../utils/helpers/crypto-helper');
} catch (error) {
  logger.warn('CryptoHelper not available, encryption tasks will be skipped');
  CryptoHelper = null;
}

try {
  const rolesModule = require('../../utils/constants/roles');
  SYSTEM_ROLES = rolesModule.SYSTEM_ROLES || {};
  DEFAULT_ROLES = rolesModule.DEFAULT_ROLES || {};
} catch (error) {
  logger.warn('Roles constants not available, using fallback defaults');
  DEFAULT_ROLES = {
    admin: {
      displayName: 'Administrator',
      description: 'System administrator',
      permissions: ['admin.full']
    },
    user: {
      displayName: 'User',
      description: 'Regular user',
      permissions: ['user.basic']
    },
    org_owner: {
      displayName: 'Organization Owner',
      description: 'Organization owner',
      permissions: ['org.full']
    },
    org_admin: {
      displayName: 'Organization Admin',
      description: 'Organization administrator',
      permissions: ['org.admin']
    },
    org_member: {
      displayName: 'Organization Member',
      description: 'Organization member',
      permissions: ['org.member']
    }
  };
}

try {
  const permissionsModule = require('../../utils/constants/permissions');
  PERMISSIONS = permissionsModule.PERMISSIONS || {};
} catch (error) {
  logger.warn('Permissions constants not available, using fallback defaults');
  PERMISSIONS = {
    USER_READ: 'user.read',
    USER_WRITE: 'user.write',
    ORG_READ: 'org.read',
    ORG_WRITE: 'org.write'
  };
}

/**
 * @class DataMigration
 * @description Performs comprehensive data transformations and migrations across collections
 */
class DataMigration {
  /**
   * @private
   * @static
   * @readonly
   */
  static #MIGRATION_TASKS = [
    {
      name: 'migrateUserRoles',
      description: 'Migrate legacy role strings to new role system',
      collections: ['users'],
      priority: 1
    },
    {
      name: 'populateOrganizationSlugs',
      description: 'Generate URL-safe slugs for organizations',
      collections: ['organizations'],
      priority: 2
    },
    {
      name: 'migrateSessionData',
      description: 'Transform legacy session data to new format',
      collections: ['user_sessions'],
      priority: 3
    },
    {
      name: 'normalizeEmailAddresses',
      description: 'Normalize and validate email addresses',
      collections: ['users', 'organization_invitations'],
      priority: 4
    },
    {
      name: 'generateSearchKeywords',
      description: 'Generate search keywords for text search',
      collections: ['users', 'organizations'],
      priority: 5
    },
    {
      name: 'encryptSensitiveData',
      description: 'Encrypt sensitive fields that were stored in plain text',
      collections: ['payment_methods', 'api_keys'],
      priority: 6
    },
    {
      name: 'populateDefaultPermissions',
      description: 'Ensure all roles have proper permissions',
      collections: ['roles'],
      priority: 7
    },
    {
      name: 'consolidateBillingData',
      description: 'Consolidate billing information across collections',
      collections: ['organizations', 'subscriptions', 'invoices'],
      priority: 8
    },
    {
      name: 'migrateNotificationPreferences',
      description: 'Update notification preferences to new structure',
      collections: ['user_profiles'],
      priority: 9
    },
    {
      name: 'cleanupOrphanedRecords',
      description: 'Remove orphaned records with broken references',
      collections: ['all'],
      priority: 10
    }
  ];

  static #BATCH_SIZE = 1000;
  static #OPERATION_TIMEOUT = 120000; // 2 minutes
  static #RETRY_ATTEMPTS = 3;
  static #RETRY_DELAY = 5000;

  static #migrationStats = {
    tasksCompleted: 0,
    recordsProcessed: 0,
    errors: [],
    warnings: []
  };

  /**
   * Applies the migration - performs all data transformations
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {AppError} If migration fails
   */
  static async up() {
    const startTime = Date.now();

    try {
      logger.info('Starting data migration');

      const connection = ConnectionManager.getConnection();
      if (!connection) {
        throw new AppError('No database connection available', 500, 'NO_CONNECTION');
      }

      // Reset stats
      DataMigration.#migrationStats = {
        tasksCompleted: 0,
        recordsProcessed: 0,
        errors: [],
        warnings: []
      };

      // Sort tasks by priority
      const sortedTasks = [...DataMigration.#MIGRATION_TASKS].sort(
        (a, b) => a.priority - b.priority
      );

      // Execute each migration task
      for (const task of sortedTasks) {
        logger.info(`Executing migration task: ${task.name}`);

        try {
          const taskResult = await DataMigration.#executeTask(task);
          
          DataMigration.#migrationStats.tasksCompleted++;
          DataMigration.#migrationStats.recordsProcessed += taskResult.recordsProcessed || 0;

          logger.info(`Completed migration task: ${task.name}`, {
            recordsProcessed: taskResult.recordsProcessed || 0,
            duration: taskResult.duration || 0
          });

        } catch (error) {
          logger.error(`Migration task failed: ${task.name}`, error);
          
          const errorMessage = error && error.message ? error.message : 'Unknown error';
          DataMigration.#migrationStats.errors.push({
            task: task.name,
            error: errorMessage
          });

          // Continue with other tasks unless critical
          if (task.priority <= 3) {
            throw error; // Critical tasks must succeed
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Data migration completed', {
        duration,
        ...DataMigration.#migrationStats
      });

      if (DataMigration.#migrationStats.errors.length > 0) {
        throw new AppError(
          'Data migration completed with errors',
          500,
          'DATA_MIGRATION_PARTIAL_ERROR',
          { errors: DataMigration.#migrationStats.errors }
        );
      }

    } catch (error) {
      logger.error('Data migration failed', error);
      
      // Safe error handling without instanceof
      if (error && error.name === 'AppError') {
        throw error;
      }

      const errorMessage = error && error.message ? error.message : 'Unknown error';

      throw new AppError(
        'Failed to complete data migration',
        500,
        'DATA_MIGRATION_ERROR',
        {
          originalError: errorMessage,
          stats: DataMigration.#migrationStats
        }
      );
    }
  }

  /**
   * Rolls back the migration - limited rollback support for data transformations
   * @static
   * @async
   * @returns {Promise<void>}
   * @throws {AppError} If rollback fails
   */
  static async down() {
    try {
      logger.info('Starting data migration rollback');

      const connection = ConnectionManager.getConnection();
      if (!connection) {
        throw new AppError('No database connection available', 500, 'NO_CONNECTION');
      }

      const db = connection.db;

      // Rollback tasks that support it
      const rollbackTasks = [
        {
          name: 'removeGeneratedSlugs',
          collection: 'organizations',
          operation: async (collection) => {
            return await collection.updateMany(
              { _generatedSlug: true },
              { $unset: { slug: '', _generatedSlug: '' } }
            );
          }
        },
        {
          name: 'removeSearchKeywords',
          collections: ['users', 'organizations'],
          operation: async (collection) => {
            return await collection.updateMany(
              { _keywordsGenerated: true },
              { $unset: { searchKeywords: '', _keywordsGenerated: '' } }
            );
          }
        }
      ];

      let rollbackCount = 0;

      for (const task of rollbackTasks) {
        try {
          if (task.collections && Array.isArray(task.collections)) {
            for (const collectionName of task.collections) {
              const collection = db.collection(collectionName);
              const result = await task.operation(collection);
              rollbackCount += result.modifiedCount || 0;
            }
          } else if (task.collection) {
            const collection = db.collection(task.collection);
            const result = await task.operation(collection);
            rollbackCount += result.modifiedCount || 0;
          }

          logger.info(`Completed rollback task: ${task.name}`);

        } catch (error) {
          logger.error(`Rollback task failed: ${task.name}`, error);
        }
      }

      logger.info('Data migration rollback completed', {
        rollbackCount,
        note: 'Only reversible transformations were rolled back'
      });

    } catch (error) {
      logger.error('Data migration rollback failed', error);
      
      const errorMessage = error && error.message ? error.message : 'Unknown error';
      
      throw new AppError(
        'Failed to rollback data migration',
        500,
        'DATA_ROLLBACK_ERROR',
        { originalError: errorMessage }
      );
    }
  }

  /**
   * @private
   * Executes a single migration task with enhanced error handling
   * @static
   * @async
   * @param {Object} task - Migration task definition
   * @returns {Promise<Object>} Task execution result
   */
  static async #executeTask(task) {
    const startTime = Date.now();
    let recordsProcessed = 0;

    try {
      // Validate task
      if (!task || !task.name) {
        throw new Error('Invalid task definition');
      }

      // Get task implementation
      const taskImpl = DataMigration.#getTaskImplementation(task.name);
      
      if (!taskImpl || typeof taskImpl !== 'function') {
        throw new Error(`No implementation found for task: ${task.name}`);
      }

      // Execute task with timeout protection
      recordsProcessed = await DataMigration.#executeWithTimeout(taskImpl, DataMigration.#OPERATION_TIMEOUT);

      return {
        recordsProcessed: recordsProcessed || 0,
        duration: Date.now() - startTime
      };

    } catch (error) {
      logger.error(`Task execution failed: ${task.name}`, error);
      throw error;
    }
  }

  /**
   * @private
   * Executes function with timeout protection
   * @static
   * @async
   * @param {Function} fn - Function to execute
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<*>} Function result
   */
  static async #executeWithTimeout(fn, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Operation timed out'));
      }, timeout);

      try {
        const result = await fn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * @private
   * Gets task implementation by name
   * @static
   * @param {string} taskName - Task name
   * @returns {Function|null} Task implementation function
   */
  static #getTaskImplementation(taskName) {
    const implementations = {
      migrateUserRoles: DataMigration.#migrateUserRoles,
      populateOrganizationSlugs: DataMigration.#populateOrganizationSlugs,
      migrateSessionData: DataMigration.#migrateSessionData,
      normalizeEmailAddresses: DataMigration.#normalizeEmailAddresses,
      generateSearchKeywords: DataMigration.#generateSearchKeywords,
      encryptSensitiveData: DataMigration.#encryptSensitiveData,
      populateDefaultPermissions: DataMigration.#populateDefaultPermissions,
      consolidateBillingData: DataMigration.#consolidateBillingData,
      migrateNotificationPreferences: DataMigration.#migrateNotificationPreferences,
      cleanupOrphanedRecords: DataMigration.#cleanupOrphanedRecords
    };

    return implementations[taskName] || null;
  }

  /**
   * @private
   * Migrates legacy user roles to new role system with enhanced error handling
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #migrateUserRoles() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    const usersCollection = db.collection('users');
    const rolesCollection = db.collection('roles');

    let processedCount = 0;

    try {
      // Ensure default roles exist - with null check for DEFAULT_ROLES
      if (DEFAULT_ROLES && typeof DEFAULT_ROLES === 'object') {
        for (const [roleName, roleData] of Object.entries(DEFAULT_ROLES)) {
          if (!roleName || !roleData) continue;

          const roleDoc = {
            name: roleName,
            displayName: roleData.displayName || roleName,
            description: roleData.description || `${roleName} role`,
            permissions: Array.isArray(roleData.permissions) ? roleData.permissions : [],
            isSystem: true,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await rolesCollection.updateOne(
            { name: roleName, isSystem: true },
            { $setOnInsert: roleDoc },
            { upsert: true }
          );
        }
      }

      // Migrate user roles in batches
      const totalUsers = await usersCollection.countDocuments({
        $or: [
          { role: { $exists: true } },
          { roles: { $size: 0 } },
          { roles: { $exists: false } }
        ]
      });

      let skip = 0;
      const batchSize = DataMigration.#BATCH_SIZE;

      while (skip < totalUsers) {
        const users = await usersCollection
          .find({
            $or: [
              { role: { $exists: true } },
              { roles: { $size: 0 } },
              { roles: { $exists: false } }
            ]
          })
          .skip(skip)
          .limit(batchSize)
          .toArray();

        if (users.length === 0) break;

        for (const user of users) {
          if (!user || !user._id) continue;

          const updates = { $set: {}, $unset: {} };

          // Convert legacy role to new format
          if (user.role && typeof user.role === 'string') {
            const mappedRole = DataMigration.#mapLegacyRole(user.role);
            updates.$set.roles = [mappedRole];
            updates.$unset.role = '';
          } else if (!user.roles || !Array.isArray(user.roles) || user.roles.length === 0) {
            // Assign default role based on organization membership
            const defaultRole = user.organizationId ? 'org_member' : 'user';
            updates.$set.roles = [defaultRole];
          }

          // Update user if needed
          if (Object.keys(updates.$set).length > 0 || Object.keys(updates.$unset).length > 0) {
            await usersCollection.updateOne(
              { _id: user._id },
              updates
            );
            processedCount++;
          }
        }

        skip += batchSize;
        
        // Log progress for large datasets
        if (totalUsers > batchSize) {
          logger.debug(`User roles migration progress: ${Math.min(skip, totalUsers)}/${totalUsers}`);
        }
      }

    } catch (error) {
      logger.error('Failed to migrate user roles', error);
      throw error;
    }

    return processedCount;
  }

  /**
   * @private
   * Populates organization slugs with enhanced error handling
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #populateOrganizationSlugs() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    const collection = db.collection('organizations');

    let processedCount = 0;

    try {
      const totalOrgs = await collection.countDocuments({ 
        $or: [
          { slug: { $exists: false } },
          { slug: null },
          { slug: '' }
        ]
      });

      let skip = 0;
      const batchSize = DataMigration.#BATCH_SIZE;

      while (skip < totalOrgs) {
        const orgs = await collection
          .find({ 
            $or: [
              { slug: { $exists: false } },
              { slug: null },
              { slug: '' }
            ]
          })
          .skip(skip)
          .limit(batchSize)
          .toArray();

        if (orgs.length === 0) break;

        for (const org of orgs) {
          if (!org || !org._id || !org.name) continue;

          // Generate slug from organization name
          let baseSlug = org.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

          if (!baseSlug) {
            baseSlug = `org-${org._id.toString().substring(0, 8)}`;
          }

          // Ensure uniqueness
          let slug = baseSlug;
          let counter = 1;
          
          while (await collection.findOne({ slug, _id: { $ne: org._id } })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
          }

          await collection.updateOne(
            { _id: org._id },
            { 
              $set: { 
                slug,
                _generatedSlug: true
              }
            }
          );

          processedCount++;
        }

        skip += batchSize;
        
        if (totalOrgs > batchSize) {
          logger.debug(`Organization slugs progress: ${Math.min(skip, totalOrgs)}/${totalOrgs}`);
        }
      }

    } catch (error) {
      logger.error('Failed to populate organization slugs', error);
      throw error;
    }

    return processedCount;
  }

  /**
   * @private
   * Migrates legacy session data with enhanced error handling
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #migrateSessionData() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    const collection = db.collection('user_sessions');

    let processedCount = 0;

    try {
      const session = await connection.startSession();

      try {
        await session.withTransaction(async () => {
          const totalSessions = await collection.countDocuments({
            $or: [
              { userAgent: { $exists: true }, device: { $exists: false } },
              { ip: { $exists: true }, ipAddress: { $exists: false } }
            ]
          });

          let skip = 0;
          const batchSize = Math.min(DataMigration.#BATCH_SIZE, 100); // Smaller batches for sessions

          while (skip < totalSessions) {
            const sessions = await collection
              .find({
                $or: [
                  { userAgent: { $exists: true }, device: { $exists: false } },
                  { ip: { $exists: true }, ipAddress: { $exists: false } }
                ]
              })
              .skip(skip)
              .limit(batchSize)
              .toArray();

            if (sessions.length === 0) break;

            for (const sessionDoc of sessions) {
              if (!sessionDoc || !sessionDoc._id) continue;

              const updates = { $set: {}, $unset: {} };

              // Parse user agent to device info
              if (sessionDoc.userAgent && !sessionDoc.device) {
                updates.$set.device = DataMigration.#parseUserAgent(sessionDoc.userAgent);
              }

              // Migrate IP field
              if (sessionDoc.ip && !sessionDoc.ipAddress) {
                updates.$set.ipAddress = sessionDoc.ip;
                updates.$unset.ip = '';
              }

              // Add session metadata
              updates.$set.metadata = {
                migrated: true,
                migratedAt: new Date(),
                version: '2.0'
              };

              if (Object.keys(updates.$set).length > 0 || Object.keys(updates.$unset).length > 0) {
                await collection.updateOne(
                  { _id: sessionDoc._id },
                  updates,
                  { session }
                );
                processedCount++;
              }
            }

            skip += batchSize;
            
            if (totalSessions > batchSize) {
              logger.debug(`Session migration progress: ${Math.min(skip, totalSessions)}/${totalSessions}`);
            }
          }
        });

      } finally {
        await session.endSession();
      }

    } catch (error) {
      logger.error('Failed to migrate session data', error);
      throw error;
    }

    return processedCount;
  }

  /**
   * @private
   * Normalizes email addresses with enhanced validation
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #normalizeEmailAddresses() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    let processedCount = 0;

    const collections = ['users', 'organization_invitations'];

    try {
      for (const collectionName of collections) {
        const collection = db.collection(collectionName);
        
        const totalDocs = await collection.countDocuments({
          email: { $exists: true, $ne: null }
        });

        let skip = 0;
        const batchSize = DataMigration.#BATCH_SIZE;

        while (skip < totalDocs) {
          const docs = await collection
            .find({
              email: { $exists: true, $ne: null }
            })
            .skip(skip)
            .limit(batchSize)
            .toArray();

          if (docs.length === 0) break;

          for (const doc of docs) {
            if (!doc || !doc._id || !doc.email) continue;

            const normalizedEmail = doc.email.trim().toLowerCase();

            if (normalizedEmail !== doc.email) {
              // Validate email format
              if (DataValidator && DataValidator.isValidEmail(normalizedEmail)) {
                await collection.updateOne(
                  { _id: doc._id },
                  { 
                    $set: { 
                      email: normalizedEmail,
                      originalEmail: doc.email
                    }
                  }
                );
                processedCount++;
              } else {
                DataMigration.#migrationStats.warnings.push({
                  collection: collectionName,
                  documentId: doc._id,
                  issue: 'Invalid email format',
                  email: doc.email
                });
              }
            }
          }

          skip += batchSize;
          
          if (totalDocs > batchSize) {
            logger.debug(`Email normalization progress for ${collectionName}: ${Math.min(skip, totalDocs)}/${totalDocs}`);
          }
        }
      }

    } catch (error) {
      logger.error('Failed to normalize email addresses', error);
      throw error;
    }

    return processedCount;
  }

  /**
   * @private
   * Generates search keywords for text search
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #generateSearchKeywords() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    let processedCount = 0;

    const configurations = [
      {
        collection: 'users',
        fields: ['firstName', 'lastName', 'email', 'username']
      },
      {
        collection: 'organizations',
        fields: ['name', 'description', 'industry']
      }
    ];

    try {
      for (const config of configurations) {
        const collection = db.collection(config.collection);
        
        const totalDocs = await collection.countDocuments({
          $or: [
            { searchKeywords: { $exists: false } },
            { searchKeywords: { $size: 0 } }
          ]
        });

        let skip = 0;
        const batchSize = DataMigration.#BATCH_SIZE;

        while (skip < totalDocs) {
          const docs = await collection
            .find({
              $or: [
                { searchKeywords: { $exists: false } },
                { searchKeywords: { $size: 0 } }
              ]
            })
            .skip(skip)
            .limit(batchSize)
            .toArray();

          if (docs.length === 0) break;

          for (const doc of docs) {
            if (!doc || !doc._id) continue;

            const keywords = new Set();

            // Extract keywords from specified fields
            for (const field of config.fields) {
              const value = DataMigration.#getNestedValue(doc, field);
              if (value && typeof value === 'string') {
                // Split and clean keywords
                value.toLowerCase()
                  .split(/\s+/)
                  .filter(word => word.length > 2)
                  .forEach(word => keywords.add(word));
              }
            }

            if (keywords.size > 0) {
              await collection.updateOne(
                { _id: doc._id },
                { 
                  $set: { 
                    searchKeywords: Array.from(keywords),
                    _keywordsGenerated: true
                  }
                }
              );
              processedCount++;
            }
          }

          skip += batchSize;
          
          if (totalDocs > batchSize) {
            logger.debug(`Keywords generation progress for ${config.collection}: ${Math.min(skip, totalDocs)}/${totalDocs}`);
          }
        }
      }

    } catch (error) {
      logger.error('Failed to generate search keywords', error);
      throw error;
    }

    return processedCount;
  }

  /**
   * @private
   * Encrypts sensitive data fields
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #encryptSensitiveData() {
    // Skip if encryption helper not available
    if (!CryptoHelper || typeof CryptoHelper.encrypt !== 'function') {
      logger.warn('CryptoHelper not available, skipping encryption task');
      return 0;
    }

    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    let processedCount = 0;

    const encryptionTasks = [
      {
        collection: 'payment_methods',
        fields: ['accountNumber', 'routingNumber']
      },
      {
        collection: 'api_keys',
        fields: ['secret']
      }
    ];

    try {
      for (const task of encryptionTasks) {
        const collection = db.collection(task.collection);
        
        const totalDocs = await collection.countDocuments({
          _encrypted: { $ne: true }
        });

        let skip = 0;
        const batchSize = Math.min(DataMigration.#BATCH_SIZE, 100); // Smaller batches for encryption

        while (skip < totalDocs) {
          const docs = await collection
            .find({
              _encrypted: { $ne: true }
            })
            .skip(skip)
            .limit(batchSize)
            .toArray();

          if (docs.length === 0) break;

          for (const doc of docs) {
            if (!doc || !doc._id) continue;

            const updates = { $set: { _encrypted: true } };
            let needsUpdate = false;

            for (const field of task.fields) {
              const value = doc[field];
              if (value && typeof value === 'string' && !value.startsWith('enc:')) {
                try {
                  updates.$set[field] = await CryptoHelper.encrypt(value);
                  needsUpdate = true;
                } catch (encryptError) {
                  logger.warn(`Failed to encrypt field ${field} for document ${doc._id}`, encryptError.message);
                }
              }
            }

            if (needsUpdate) {
              await collection.updateOne(
                { _id: doc._id },
                updates
              );
              processedCount++;
            }
          }

          skip += batchSize;
          
          if (totalDocs > batchSize) {
            logger.debug(`Encryption progress for ${task.collection}: ${Math.min(skip, totalDocs)}/${totalDocs}`);
          }
        }
      }

    } catch (error) {
      logger.error('Failed to encrypt sensitive data', error);
      throw error;
    }

    return processedCount;
  }

  /**
   * @private
   * Populates default permissions for roles
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #populateDefaultPermissions() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    const collection = db.collection('roles');

    let processedCount = 0;

    try {
      const totalRoles = await collection.countDocuments({
        $or: [
          { permissions: { $exists: false } },
          { permissions: { $size: 0 } }
        ]
      });

      let skip = 0;
      const batchSize = DataMigration.#BATCH_SIZE;

      while (skip < totalRoles) {
        const roles = await collection
          .find({
            $or: [
              { permissions: { $exists: false } },
              { permissions: { $size: 0 } }
            ]
          })
          .skip(skip)
          .limit(batchSize)
          .toArray();

        if (roles.length === 0) break;

        for (const role of roles) {
          if (!role || !role._id) continue;

          let permissions = [];

          // Assign permissions based on role type
          if (role.isSystem && role.name && DEFAULT_ROLES[role.name]) {
            permissions = DEFAULT_ROLES[role.name].permissions || [];
          } else {
            // Custom roles get basic permissions
            permissions = DataMigration.#getBasicPermissions(role.name);
          }

          if (permissions.length > 0) {
            await collection.updateOne(
              { _id: role._id },
              { $set: { permissions } }
            );
            processedCount++;
          }
        }

        skip += batchSize;
        
        if (totalRoles > batchSize) {
          logger.debug(`Permissions population progress: ${Math.min(skip, totalRoles)}/${totalRoles}`);
        }
      }

    } catch (error) {
      logger.error('Failed to populate default permissions', error);
      throw error;
    }

    return processedCount;
  }

  /**
   * @private
   * Consolidates billing data across collections
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #consolidateBillingData() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    let processedCount = 0;

    try {
      const session = await connection.startSession();

      try {
        await session.withTransaction(async () => {
          const orgsCollection = db.collection('organizations');
          const subsCollection = db.collection('subscriptions');

          const totalOrgs = await orgsCollection.countDocuments({
            'subscription.planId': { $exists: false }
          });

          let skip = 0;
          const batchSize = DataMigration.#BATCH_SIZE;

          while (skip < totalOrgs) {
            const orgs = await orgsCollection
              .find({
                'subscription.planId': { $exists: false }
              })
              .skip(skip)
              .limit(batchSize)
              .toArray();

            if (orgs.length === 0) break;

            for (const org of orgs) {
              if (!org || !org._id) continue;

              const subscription = await subsCollection.findOne(
                { organizationId: org._id },
                { session }
              );

              if (subscription) {
                await orgsCollection.updateOne(
                  { _id: org._id },
                  {
                    $set: {
                      'subscription.planId': subscription.planId,
                      'subscription.status': subscription.status,
                      'subscription.currentPeriodEnd': subscription.currentPeriodEnd
                    }
                  },
                  { session }
                );
                processedCount++;
              }
            }

            skip += batchSize;
            
            if (totalOrgs > batchSize) {
              logger.debug(`Billing consolidation progress: ${Math.min(skip, totalOrgs)}/${totalOrgs}`);
            }
          }
        });

      } finally {
        await session.endSession();
      }

    } catch (error) {
      logger.error('Failed to consolidate billing data', error);
      throw error;
    }

    return processedCount;
  }

  /**
   * @private
   * Migrates notification preferences to new structure
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #migrateNotificationPreferences() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    const collection = db.collection('user_profiles');

    let processedCount = 0;

    try {
      const totalProfiles = await collection.countDocuments({
        'preferences.notifications': { $exists: false }
      });

      let skip = 0;
      const batchSize = DataMigration.#BATCH_SIZE;

      while (skip < totalProfiles) {
        const profiles = await collection
          .find({
            'preferences.notifications': { $exists: false }
          })
          .skip(skip)
          .limit(batchSize)
          .toArray();

        if (profiles.length === 0) break;

        for (const profile of profiles) {
          if (!profile || !profile._id) continue;

          // Map old preferences to new structure
          const notificationPrefs = {
            email: {
              enabled: profile.emailNotifications !== false,
              frequency: 'immediate',
              categories: {
                security: true,
                billing: true,
                updates: profile.marketingEmails !== false,
                reports: true
              }
            },
            sms: {
              enabled: false,
              categories: {
                security: true,
                billing: false,
                updates: false,
                reports: false
              }
            },
            push: {
              enabled: true,
              categories: {
                security: true,
                billing: true,
                updates: true,
                reports: false
              }
            },
            inApp: {
              enabled: true,
              categories: {
                all: true
              }
            }
          };

          await collection.updateOne(
            { _id: profile._id },
            {
              $set: {
                'preferences.notifications': notificationPrefs
              },
              $unset: {
                emailNotifications: '',
                marketingEmails: ''
              }
            }
          );

          processedCount++;
        }

        skip += batchSize;
        
        if (totalProfiles > batchSize) {
          logger.debug(`Notification preferences migration progress: ${Math.min(skip, totalProfiles)}/${totalProfiles}`);
        }
      }

    } catch (error) {
      logger.error('Failed to migrate notification preferences', error);
      throw error;
    }

    return processedCount;
  }

  /**
   * @private
   * Cleans up orphaned records
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #cleanupOrphanedRecords() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    let processedCount = 0;

    const cleanupTasks = [
      {
        collection: 'organization_members',
        parentCollection: 'organizations',
        parentField: 'organizationId'
      },
      {
        collection: 'user_sessions',
        parentCollection: 'users',
        parentField: 'userId'
      },
      {
        collection: 'user_profiles',
        parentCollection: 'users',
        parentField: 'userId'
      }
    ];

    try {
      for (const task of cleanupTasks) {
        const collection = db.collection(task.collection);

        // Find orphaned records using aggregation
        const orphanedIds = [];
        
        try {
          const orphanedCursor = collection.aggregate([
            {
              $lookup: {
                from: task.parentCollection,
                localField: task.parentField,
                foreignField: '_id',
                as: 'parent'
              }
            },
            {
              $match: {
                parent: { $size: 0 }
              }
            },
            {
              $project: {
                _id: 1
              }
            },
            {
              $limit: 1000 // Limit cleanup batch size
            }
          ]);

          while (await orphanedCursor.hasNext()) {
            const doc = await orphanedCursor.next();
            if (doc && doc._id) {
              orphanedIds.push(doc._id);
            }
          }

          await orphanedCursor.close();
        } catch (aggregationError) {
          logger.warn(`Failed to find orphaned records in ${task.collection}`, aggregationError.message);
          continue;
        }

        if (orphanedIds.length > 0) {
          // Archive orphaned records before deletion
          const archiveCollection = db.collection(`archived_${task.collection}`);
          
          try {
            const orphanedDocs = await collection.find({
              _id: { $in: orphanedIds }
            }).toArray();

            if (orphanedDocs.length > 0) {
              await archiveCollection.insertMany(
                orphanedDocs.map(doc => ({
                  ...doc,
                  _archivedAt: new Date(),
                  _archiveReason: 'orphaned_record'
                }))
              );

              // Delete orphaned records
              const deleteResult = await collection.deleteMany({
                _id: { $in: orphanedIds }
              });

              processedCount += deleteResult.deletedCount || 0;

              logger.info(`Cleaned up orphaned records from ${task.collection}`, {
                count: deleteResult.deletedCount || 0
              });
            }
          } catch (cleanupError) {
            logger.error(`Failed to cleanup orphaned records in ${task.collection}`, cleanupError);
          }
        }
      }

    } catch (error) {
      logger.error('Failed to cleanup orphaned records', error);
      throw error;
    }

    return processedCount;
  }

  /**
   * @private
   * Maps legacy role to new role system
   * @static
   * @param {string} legacyRole - Legacy role name
   * @returns {string} New role name
   */
  static #mapLegacyRole(legacyRole) {
    if (!legacyRole || typeof legacyRole !== 'string') {
      return 'user';
    }

    const roleMapping = {
      'admin': 'admin',
      'superadmin': 'super_admin',
      'super_admin': 'super_admin',
      'owner': 'org_owner',
      'manager': 'org_admin',
      'member': 'org_member',
      'user': 'user',
      'guest': 'guest'
    };

    return roleMapping[legacyRole.toLowerCase()] || 'user';
  }

  /**
   * @private
   * Parses user agent string to device information
   * @static
   * @param {string} userAgent - User agent string
   * @returns {Object} Device information
   */
  static #parseUserAgent(userAgent) {
    const device = {
      type: 'unknown',
      os: 'unknown',
      browser: 'unknown'
    };

    if (!userAgent || typeof userAgent !== 'string') {
      return device;
    }

    // Simple parsing logic
    if (/mobile/i.test(userAgent)) {
      device.type = 'mobile';
    } else if (/tablet/i.test(userAgent)) {
      device.type = 'tablet';
    } else {
      device.type = 'desktop';
    }

    if (/windows/i.test(userAgent)) {
      device.os = 'Windows';
    } else if (/mac os/i.test(userAgent)) {
      device.os = 'macOS';
    } else if (/linux/i.test(userAgent)) {
      device.os = 'Linux';
    } else if (/android/i.test(userAgent)) {
      device.os = 'Android';
    } else if (/ios|iphone|ipad/i.test(userAgent)) {
      device.os = 'iOS';
    }

    if (/chrome/i.test(userAgent)) {
      device.browser = 'Chrome';
    } else if (/firefox/i.test(userAgent)) {
      device.browser = 'Firefox';
    } else if (/safari/i.test(userAgent)) {
      device.browser = 'Safari';
    } else if (/edge/i.test(userAgent)) {
      device.browser = 'Edge';
    }

    return device;
  }

  /**
   * @private
   * Gets nested value from object safely
   * @static
   * @param {Object} obj - Source object
   * @param {string} path - Dot-separated path
   * @returns {*} Value at path or undefined
   */
  static #getNestedValue(obj, path) {
    if (!obj || !path || typeof path !== 'string') {
      return undefined;
    }

    try {
      return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
      }, obj);
    } catch (error) {
      return undefined;
    }
  }

  /**
   * @private
   * Gets basic permissions for custom roles
   * @static
   * @param {string} roleName - Role name
   * @returns {Array<string>} Basic permissions
   */
  static #getBasicPermissions(roleName) {
    const basicPermissions = [
      'profile.read',
      'profile.update',
      'organization.read'
    ];

    if (roleName && typeof roleName === 'string' && roleName.toLowerCase().includes('admin')) {
      basicPermissions.push(
        'users.read',
        'users.create',
        'organization.update'
      );
    }

    return basicPermissions;
  }

  /**
   * Validates migration completion
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
      const validationResults = {
        valid: true,
        checks: [],
        warnings: []
      };

      // Validation checks with error handling
      const checks = [
        {
          name: 'User roles populated',
          validate: async () => {
            try {
              const count = await db.collection('users').countDocuments({
                roles: { $exists: true, $ne: [], $type: 'array' }
              });
              const total = await db.collection('users').countDocuments();
              return { passed: count === total, ratio: `${count}/${total}` };
            } catch (error) {
              return { passed: false, error: error.message };
            }
          }
        },
        {
          name: 'Organization slugs unique',
          validate: async () => {
            try {
              const duplicates = await db.collection('organizations').aggregate([
                { $group: { _id: '$slug', count: { $sum: 1 } } },
                { $match: { count: { $gt: 1 } } }
              ]).toArray();
              return { passed: duplicates.length === 0, duplicates: duplicates.length };
            } catch (error) {
              return { passed: false, error: error.message };
            }
          }
        },
        {
          name: 'Email addresses normalized',
          validate: async () => {
            try {
              const unnormalized = await db.collection('users').countDocuments({
                $expr: { $ne: ['$email', { $toLower: '$email' }] }
              });
              return { passed: unnormalized === 0, unnormalized };
            } catch (error) {
              return { passed: false, error: error.message };
            }
          }
        }
      ];

      for (const check of checks) {
        try {
          const result = await check.validate();
          validationResults.checks.push({
            name: check.name,
            ...result
          });

          if (!result.passed) {
            validationResults.valid = false;
          }
        } catch (checkError) {
          validationResults.checks.push({
            name: check.name,
            passed: false,
            error: checkError.message
          });
          validationResults.valid = false;
        }
      }

      return validationResults;

    } catch (error) {
      logger.error('Migration validation failed', error);
      
      const errorMessage = error && error.message ? error.message : 'Unknown error';
      
      throw new AppError(
        'Failed to validate migration',
        500,
        'VALIDATION_ERROR',
        { originalError: errorMessage }
      );
    }
  }
}

module.exports = DataMigration;