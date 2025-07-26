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
const AppError = require('../../utils/app-error');
const ConnectionManager = require('../connection-manager');
const TransactionManager = require('../transaction-manager');
const DataValidator = require('../validators/data-validator');
const CryptoHelper = require('../../utils/helpers/crypto-helper');
const { SYSTEM_ROLES, DEFAULT_ROLES } = require('../../utils/constants/roles');
const { PERMISSIONS } = require('../../utils/constants/permissions');

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
          DataMigration.#migrationStats.recordsProcessed += taskResult.recordsProcessed;

          logger.info(`Completed migration task: ${task.name}`, {
            recordsProcessed: taskResult.recordsProcessed,
            duration: taskResult.duration
          });

        } catch (error) {
          logger.error(`Migration task failed: ${task.name}`, error);
          
          DataMigration.#migrationStats.errors.push({
            task: task.name,
            error: error.message
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
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to complete data migration',
        500,
        'DATA_MIGRATION_ERROR',
        {
          originalError: error.message,
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

      // Note: Many data transformations cannot be safely rolled back
      // This implementation focuses on reversible changes only

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
          if (task.collections) {
            for (const collectionName of task.collections) {
              const collection = db.collection(collectionName);
              const result = await task.operation(collection);
              rollbackCount += result.modifiedCount;
            }
          } else if (task.collection) {
            const collection = db.collection(task.collection);
            const result = await task.operation(collection);
            rollbackCount += result.modifiedCount;
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
      throw new AppError(
        'Failed to rollback data migration',
        500,
        'DATA_ROLLBACK_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Executes a single migration task
   * @static
   * @async
   * @param {Object} task - Migration task definition
   * @returns {Promise<Object>} Task execution result
   */
  static async #executeTask(task) {
    const startTime = Date.now();
    let recordsProcessed = 0;

    try {
      // Get task implementation
      const taskImpl = DataMigration.#getTaskImplementation(task.name);
      
      if (!taskImpl) {
        throw new Error(`No implementation found for task: ${task.name}`);
      }

      // Execute task
      recordsProcessed = await taskImpl();

      return {
        recordsProcessed,
        duration: Date.now() - startTime
      };

    } catch (error) {
      logger.error(`Task execution failed: ${task.name}`, error);
      throw error;
    }
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
   * Migrates legacy user roles to new role system
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

    // Ensure default roles exist
    for (const [roleName, roleData] of Object.entries(DEFAULT_ROLES)) {
      await rolesCollection.updateOne(
        { name: roleName, isSystem: true },
        {
          $setOnInsert: {
            name: roleName,
            displayName: roleData.displayName,
            description: roleData.description,
            permissions: roleData.permissions,
            isSystem: true,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }

    // Migrate user roles
    const cursor = usersCollection.find({
      $or: [
        { role: { $exists: true } }, // Legacy single role
        { roles: { $size: 0 } }, // Empty roles array
        { roles: { $exists: false } } // No roles field
      ]
    });

    while (await cursor.hasNext()) {
      const user = await cursor.next();
      const updates = { $set: {}, $unset: {} };

      // Convert legacy role to new format
      if (user.role && typeof user.role === 'string') {
        const mappedRole = DataMigration.#mapLegacyRole(user.role);
        updates.$set.roles = [mappedRole];
        updates.$unset.role = '';
      } else if (!user.roles || user.roles.length === 0) {
        // Assign default role based on organization membership
        const defaultRole = user.organizationId ? 'org_member' : 'user';
        updates.$set.roles = [defaultRole];
      }

      // Update user
      if (Object.keys(updates.$set).length > 0 || Object.keys(updates.$unset).length > 0) {
        await usersCollection.updateOne(
          { _id: user._id },
          updates
        );
        processedCount++;
      }
    }

    await cursor.close();
    return processedCount;
  }

  /**
   * @private
   * Populates organization slugs
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #populateOrganizationSlugs() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    const collection = db.collection('organizations');

    let processedCount = 0;
    const cursor = collection.find({ 
      $or: [
        { slug: { $exists: false } },
        { slug: null },
        { slug: '' }
      ]
    });

    while (await cursor.hasNext()) {
      const org = await cursor.next();
      
      // Generate slug from organization name
      let baseSlug = org.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

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
            _generatedSlug: true // Mark as generated for rollback
          }
        }
      );

      processedCount++;
    }

    await cursor.close();
    return processedCount;
  }

  /**
   * @private
   * Migrates legacy session data
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #migrateSessionData() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    const collection = db.collection('user_sessions');

    let processedCount = 0;
    const session = await connection.startSession();

    try {
      await session.withTransaction(async () => {
        const cursor = collection.find({
          $or: [
            { userAgent: { $exists: true }, device: { $exists: false } },
            { ip: { $exists: true }, ipAddress: { $exists: false } }
          ]
        });

        while (await cursor.hasNext()) {
          const sessionDoc = await cursor.next();
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

        await cursor.close();
      });

    } finally {
      await session.endSession();
    }

    return processedCount;
  }

  /**
   * @private
   * Normalizes email addresses
   * @static
   * @async
   * @returns {Promise<number>} Number of records processed
   */
  static async #normalizeEmailAddresses() {
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    let processedCount = 0;

    const collections = ['users', 'organization_invitations'];

    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      
      const cursor = collection.find({
        email: { $exists: true, $ne: null }
      });

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const normalizedEmail = doc.email.trim().toLowerCase();

        if (normalizedEmail !== doc.email) {
          // Validate email format
          if (DataValidator && DataValidator.isValidEmail(normalizedEmail)) {
            await collection.updateOne(
              { _id: doc._id },
              { 
                $set: { 
                  email: normalizedEmail,
                  originalEmail: doc.email // Store original for reference
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

      await cursor.close();
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

    for (const config of configurations) {
      const collection = db.collection(config.collection);
      
      const cursor = collection.find({
        $or: [
          { searchKeywords: { $exists: false } },
          { searchKeywords: { $size: 0 } }
        ]
      });

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
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

      await cursor.close();
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
    const connection = ConnectionManager.getConnection();
    const db = connection.db;
    let processedCount = 0;

    // Skip if encryption helper not available
    if (!CryptoHelper || !CryptoHelper.encrypt) {
      logger.warn('CryptoHelper not available, skipping encryption task');
      return 0;
    }

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

    for (const task of encryptionTasks) {
      const collection = db.collection(task.collection);
      
      const cursor = collection.find({
        _encrypted: { $ne: true }
      });

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const updates = { $set: { _encrypted: true } };
        let needsUpdate = false;

        for (const field of task.fields) {
          const value = doc[field];
          if (value && typeof value === 'string' && !value.startsWith('enc:')) {
            updates.$set[field] = await CryptoHelper.encrypt(value);
            needsUpdate = true;
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

      await cursor.close();
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

    const cursor = collection.find({
      $or: [
        { permissions: { $exists: false } },
        { permissions: { $size: 0 } }
      ]
    });

    while (await cursor.hasNext()) {
      const role = await cursor.next();
      let permissions = [];

      // Assign permissions based on role type
      if (role.isSystem) {
        permissions = DEFAULT_ROLES[role.name]?.permissions || [];
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

    await cursor.close();
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

    const session = await connection.startSession();

    try {
      await session.withTransaction(async () => {
        // Update organizations with subscription summary
        const orgsCollection = db.collection('organizations');
        const subsCollection = db.collection('subscriptions');

        const orgsCursor = orgsCollection.find({
          'subscription.planId': { $exists: false }
        });

        while (await orgsCursor.hasNext()) {
          const org = await orgsCursor.next();
          
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

        await orgsCursor.close();
      });

    } finally {
      await session.endSession();
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

    const cursor = collection.find({
      'preferences.notifications': { $exists: false }
    });

    while (await cursor.hasNext()) {
      const profile = await cursor.next();
      
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

    await cursor.close();
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

    for (const task of cleanupTasks) {
      const collection = db.collection(task.collection);
      const parentCollection = db.collection(task.parentCollection);

      // Find orphaned records
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
        }
      ]);

      const orphanedIds = [];
      while (await orphanedCursor.hasNext()) {
        const doc = await orphanedCursor.next();
        orphanedIds.push(doc._id);
      }

      if (orphanedIds.length > 0) {
        // Archive orphaned records before deletion
        const archiveCollection = db.collection(`archived_${task.collection}`);
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

          processedCount += deleteResult.deletedCount;

          logger.info(`Cleaned up orphaned records from ${task.collection}`, {
            count: deleteResult.deletedCount
          });
        }
      }
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

    if (!userAgent) return device;

    // Simple parsing logic - could be enhanced with a proper UA parser
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
   * Gets nested value from object
   * @static
   * @param {Object} obj - Source object
   * @param {string} path - Dot-separated path
   * @returns {*} Value at path
   */
  static #getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
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

    if (roleName.toLowerCase().includes('admin')) {
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

      // Validation checks
      const checks = [
        {
          name: 'User roles populated',
          validate: async () => {
            const count = await db.collection('users').countDocuments({
              roles: { $exists: true, $ne: [], $type: 'array' }
            });
            const total = await db.collection('users').countDocuments();
            return { passed: count === total, ratio: `${count}/${total}` };
          }
        },
        {
          name: 'Organization slugs unique',
          validate: async () => {
            const duplicates = await db.collection('organizations').aggregate([
              { $group: { _id: '$slug', count: { $sum: 1 } } },
              { $match: { count: { $gt: 1 } } }
            ]).toArray();
            return { passed: duplicates.length === 0, duplicates: duplicates.length };
          }
        },
        {
          name: 'Email addresses normalized',
          validate: async () => {
            const unnormalized = await db.collection('users').countDocuments({
              $expr: { $ne: ['$email', { $toLower: '$email' }] }
            });
            return { passed: unnormalized === 0, unnormalized };
          }
        }
      ];

      for (const check of checks) {
        const result = await check.validate();
        validationResults.checks.push({
          name: check.name,
          ...result
        });

        if (!result.passed) {
          validationResults.valid = false;
        }
      }

      return validationResults;

    } catch (error) {
      logger.error('Migration validation failed', error);
      throw new AppError(
        'Failed to validate migration',
        500,
        'VALIDATION_ERROR',
        { originalError: error.message }
      );
    }
  }
}

module.exports = DataMigration;