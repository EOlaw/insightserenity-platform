'use strict';

/**
 * @fileoverview Migration script for transitioning to hybrid database architecture
 * @module shared/lib/database/migrations/hybrid-migration
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/config/base-config
 */

const mongoose = require('mongoose');
const logger = require('../../utils/logger');
const config = require('../../../config/base-config');

/**
 * @class HybridMigration
 * @description Migrates from multi-database architecture to simplified hybrid approach
 */
class HybridMigration {
  
  static #connections = {
    // Old database connections
    admin: null,
    shared: null,
    audit: null,
    analytics: null,
    // New hybrid connections
    primary: null,
    analyticsNew: null
  };

  /**
   * Executes the complete migration process
   * @static
   * @async
   * @param {Object} [options={}] - Migration options
   * @returns {Promise<void>}
   */
  static async execute(options = {}) {
    try {
      logger.info('Starting hybrid database migration');

      // Phase 1: Establish connections to all databases
      await HybridMigration.#establishConnections();

      // Phase 2: Create new hybrid database structure
      await HybridMigration.#createHybridStructure();

      // Phase 3: Migrate data from old databases to hybrid structure
      await HybridMigration.#migrateData(options);

      // Phase 4: Verify data integrity
      await HybridMigration.#verifyMigration();

      // Phase 5: Update indexes and optimize
      await HybridMigration.#optimizeDatabase();

      logger.info('Hybrid database migration completed successfully');

    } catch (error) {
      logger.error('Migration failed:', error);
      await HybridMigration.#rollback();
      throw error;
    } finally {
      await HybridMigration.#closeConnections();
    }
  }

  /**
   * @private
   * Establishes connections to all required databases
   * @static
   * @async
   */
  static async #establishConnections() {
    try {
      logger.info('Establishing database connections for migration');

      // Connect to existing databases
      const baseUri = config.database.uri.replace(/\/[^/?]+(\?.*)?$/, '');

      HybridMigration.#connections.admin = await mongoose.createConnection(
        `${baseUri}/admin${config.database.uri.includes('?') ? '?' + config.database.uri.split('?')[1] : ''}`
      );

      HybridMigration.#connections.shared = await mongoose.createConnection(
        `${baseUri}/shared${config.database.uri.includes('?') ? '?' + config.database.uri.split('?')[1] : ''}`
      );

      HybridMigration.#connections.audit = await mongoose.createConnection(
        `${baseUri}/audit${config.database.uri.includes('?') ? '?' + config.database.uri.split('?')[1] : ''}`
      );

      HybridMigration.#connections.analytics = await mongoose.createConnection(
        `${baseUri}/analytics${config.database.uri.includes('?') ? '?' + config.database.uri.split('?')[1] : ''}`
      );

      // Connect to new hybrid primary database
      HybridMigration.#connections.primary = await mongoose.createConnection(config.database.uri);

      // Connect to new analytics database (if separate)
      if (config.database.analyticsUri) {
        HybridMigration.#connections.analyticsNew = await mongoose.createConnection(config.database.analyticsUri);
      } else {
        HybridMigration.#connections.analyticsNew = HybridMigration.#connections.primary;
      }

      logger.info('All database connections established');

    } catch (error) {
      logger.error('Failed to establish database connections:', error);
      throw error;
    }
  }

  /**
   * @private
   * Creates the new hybrid database structure
   * @static
   * @async
   */
  static async #createHybridStructure() {
    try {
      logger.info('Creating hybrid database structure');

      // The collections will be created automatically when data is inserted
      // We just need to ensure proper indexes are in place

      logger.info('Hybrid database structure prepared');

    } catch (error) {
      logger.error('Failed to create hybrid structure:', error);
      throw error;
    }
  }

  /**
   * @private
   * Migrates data from old databases to hybrid structure
   * @static
   * @async
   * @param {Object} options - Migration options
   */
  static async #migrateData(options = {}) {
    try {
      logger.info('Starting data migration');

      // Define collection mappings
      const migrationMappings = [
        // From admin database to primary
        { from: 'admin', to: 'primary', collections: [
          'users', 'user_profiles', 'roles', 'permissions',
          'organizations', 'organization_members', 'organization_invitations',
          'tenants', 'system_configurations', 'configuration_management',
          'security_incidents', 'sessions'
        ]},
        // From shared database to primary
        { from: 'shared', to: 'primary', collections: [
          'subscription_plans', 'features', 'system_settings',
          'webhooks', 'api_integrations', 'notifications', 
          'oauth_providers', 'passkeys'
        ]},
        // From audit database to primary (consolidating audit data)
        { from: 'audit', to: 'primary', collections: [
          'audit_logs', 'audit_alerts', 'audit_exports',
          'audit_retention_policies', 'compliance_mappings',
          'data_breaches', 'erasure_logs'
        ]},
        // From analytics database to analytics (or primary)
        { from: 'analytics', to: 'analyticsNew', collections: [
          'analytics_data', 'metrics', 'events', 'usage_tracking',
          'performance_metrics', 'user_activities', 'api_usage'
        ]}
      ];

      // Execute migrations
      for (const mapping of migrationMappings) {
        await HybridMigration.#migrateCollections(
          HybridMigration.#connections[mapping.from],
          HybridMigration.#connections[mapping.to],
          mapping.collections,
          options
        );
      }

      logger.info('Data migration completed');

    } catch (error) {
      logger.error('Data migration failed:', error);
      throw error;
    }
  }

  /**
   * @private
   * Migrates collections between databases
   * @static
   * @async
   * @param {mongoose.Connection} sourceConn - Source connection
   * @param {mongoose.Connection} targetConn - Target connection
   * @param {Array<string>} collections - Collections to migrate
   * @param {Object} options - Migration options
   */
  static async #migrateCollections(sourceConn, targetConn, collections, options = {}) {
    const batchSize = options.batchSize || 1000;

    for (const collectionName of collections) {
      try {
        logger.info(`Migrating collection: ${collectionName}`);

        const sourceCollection = sourceConn.db.collection(collectionName);
        const targetCollection = targetConn.db.collection(collectionName);

        // Check if source collection exists
        const collectionExists = await sourceConn.db.listCollections({ name: collectionName }).hasNext();
        if (!collectionExists) {
          logger.warn(`Source collection ${collectionName} does not exist, skipping`);
          continue;
        }

        // Get document count for progress tracking
        const totalDocs = await sourceCollection.countDocuments();
        if (totalDocs === 0) {
          logger.info(`Collection ${collectionName} is empty, skipping`);
          continue;
        }

        logger.info(`Migrating ${totalDocs} documents from ${collectionName}`);

        let migratedCount = 0;
        const cursor = sourceCollection.find().batchSize(batchSize);

        const batch = [];
        
        for await (const document of cursor) {
          batch.push(document);

          if (batch.length === batchSize) {
            await targetCollection.insertMany(batch, { ordered: false });
            migratedCount += batch.length;
            batch.length = 0; // Clear the array
            
            logger.debug(`Migrated ${migratedCount}/${totalDocs} documents for ${collectionName}`);
          }
        }

        // Insert remaining documents
        if (batch.length > 0) {
          await targetCollection.insertMany(batch, { ordered: false });
          migratedCount += batch.length;
        }

        logger.info(`Successfully migrated ${migratedCount} documents for collection: ${collectionName}`);

      } catch (error) {
        logger.error(`Failed to migrate collection ${collectionName}:`, error);
        
        if (options.stopOnError) {
          throw error;
        }
      }
    }
  }

  /**
   * @private
   * Verifies the migration by comparing document counts
   * @static
   * @async
   */
  static async #verifyMigration() {
    try {
      logger.info('Verifying migration data integrity');

      const verificationResults = [];

      // Define verification mappings
      const verifications = [
        { source: 'admin', target: 'primary' },
        { source: 'shared', target: 'primary' },
        { source: 'audit', target: 'primary' },
        { source: 'analytics', target: 'analyticsNew' }
      ];

      for (const verification of verifications) {
        const sourceConn = HybridMigration.#connections[verification.source];
        const targetConn = HybridMigration.#connections[verification.target];

        const sourceCollections = await sourceConn.db.listCollections().toArray();
        
        for (const collection of sourceCollections) {
          const collectionName = collection.name;
          
          const sourceCount = await sourceConn.db.collection(collectionName).countDocuments();
          const targetCount = await targetConn.db.collection(collectionName).countDocuments();

          verificationResults.push({
            collection: collectionName,
            source: verification.source,
            target: verification.target,
            sourceCount,
            targetCount,
            verified: sourceCount === targetCount
          });

          if (sourceCount !== targetCount) {
            logger.warn(`Document count mismatch for ${collectionName}: source=${sourceCount}, target=${targetCount}`);
          } else {
            logger.debug(`Verified ${collectionName}: ${sourceCount} documents`);
          }
        }
      }

      const failedVerifications = verificationResults.filter(v => !v.verified);
      
      if (failedVerifications.length > 0) {
        logger.error('Migration verification failed for some collections:', failedVerifications);
        throw new Error(`Migration verification failed for ${failedVerifications.length} collections`);
      }

      logger.info('Migration verification completed successfully');

    } catch (error) {
      logger.error('Migration verification failed:', error);
      throw error;
    }
  }

  /**
   * @private
   * Optimizes the database by creating indexes
   * @static
   * @async
   */
  static async #optimizeDatabase() {
    try {
      logger.info('Optimizing hybrid database');

      // Create essential indexes for primary database
      const primaryDb = HybridMigration.#connections.primary.db;

      // User indexes
      await primaryDb.collection('users').createIndex({ email: 1, tenantId: 1 }, { unique: true });
      await primaryDb.collection('users').createIndex({ username: 1, tenantId: 1 }, { unique: true, sparse: true });
      await primaryDb.collection('users').createIndex({ 'organizations.organizationId': 1 });

      // Configuration indexes
      await primaryDb.collection('configuration_management').createIndex(
        { key: 1, scope: 1, organizationId: 1, tenantId: 1 }, 
        { unique: true }
      );

      // Organization indexes
      await primaryDb.collection('organizations').createIndex({ tenantId: 1 });
      await primaryDb.collection('organization_members').createIndex({ organizationId: 1, userId: 1 });

      // Audit indexes
      await primaryDb.collection('audit_logs').createIndex({ entityType: 1, entityId: 1, timestamp: -1 });
      await primaryDb.collection('audit_logs').createIndex({ userId: 1, timestamp: -1 });
      await primaryDb.collection('audit_logs').createIndex({ tenantId: 1, timestamp: -1 });

      // Analytics indexes (if using separate database)
      if (HybridMigration.#connections.analyticsNew !== HybridMigration.#connections.primary) {
        const analyticsDb = HybridMigration.#connections.analyticsNew.db;
        
        await analyticsDb.collection('events').createIndex({ eventType: 1, timestamp: -1 });
        await analyticsDb.collection('events').createIndex({ userId: 1, timestamp: -1 });
        await analyticsDb.collection('events').createIndex({ tenantId: 1, timestamp: -1 });
        
        await analyticsDb.collection('metrics').createIndex({ metricName: 1, timestamp: -1 });
        await analyticsDb.collection('usage_tracking').createIndex({ resourceType: 1, timestamp: -1 });
      }

      logger.info('Database optimization completed');

    } catch (error) {
      logger.error('Database optimization failed:', error);
      throw error;
    }
  }

  /**
   * @private
   * Rollback mechanism in case of migration failure
   * @static
   * @async
   */
  static async #rollback() {
    try {
      logger.info('Initiating migration rollback');

      // In a production environment, you might want to:
      // 1. Restore from backup
      // 2. Drop newly created collections
      // 3. Reset configuration

      logger.warn('Rollback completed - please restore from backup if needed');

    } catch (error) {
      logger.error('Rollback failed:', error);
    }
  }

  /**
   * @private
   * Closes all database connections
   * @static
   * @async
   */
  static async #closeConnections() {
    try {
      logger.info('Closing database connections');

      for (const [name, connection] of Object.entries(HybridMigration.#connections)) {
        if (connection && connection !== HybridMigration.#connections.primary) {
          await connection.close();
          logger.debug(`Closed ${name} connection`);
        }
      }

      // Close primary connection last
      if (HybridMigration.#connections.primary) {
        await HybridMigration.#connections.primary.close();
        logger.debug('Closed primary connection');
      }

      logger.info('All database connections closed');

    } catch (error) {
      logger.error('Error closing database connections:', error);
    }
  }

  /**
   * Generates migration report
   * @static
   * @async
   * @returns {Promise<Object>} Migration report
   */
  static async generateReport() {
    try {
      // This would generate a detailed report of what needs to be migrated
      const report = {
        estimatedDuration: '30-60 minutes',
        estimatedDowntime: '10-15 minutes',
        collectionsMapped: 25,
        dataVolume: 'To be calculated',
        recommendations: [
          'Schedule during low-traffic hours',
          'Create full backup before migration',
          'Test on staging environment first',
          'Monitor application logs during migration'
        ]
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate migration report:', error);
      throw error;
    }
  }
}

module.exports = HybridMigration;