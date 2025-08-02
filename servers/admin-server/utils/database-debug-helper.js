/**
 * @file Database Debug and Initialization Helper
 * @description Helps debug and initialize database with proper collections
 * @version 1.0.0
 */

'use strict';

const mongoose = require('mongoose');
const logger = require('../../shared/lib/utils/logger');

/**
 * @class DatabaseDebugHelper
 * @description Helper class to debug and initialize database properly
 */
class DatabaseDebugHelper {
    
    /**
     * Debug current database state
     * @static
     * @async
     * @param {Object} connection - Database connection
     * @returns {Promise<Object>} Debug information
     */
    static async debugDatabaseState(connection) {
        try {
            if (!connection) {
                return { error: 'No database connection provided' };
            }

            const debugInfo = {
                connection: {
                    readyState: connection.readyState,
                    name: connection.name,
                    host: connection.host,
                    port: connection.port,
                    db: connection.db ? connection.db.databaseName : 'No database'
                },
                models: {},
                collections: [],
                databases: []
            };

            // Get connection state names
            const stateNames = {
                0: 'disconnected',
                1: 'connected',
                2: 'connecting',
                3: 'disconnecting'
            };
            debugInfo.connection.stateName = stateNames[connection.readyState];

            // List registered models
            if (connection.models) {
                debugInfo.models = Object.keys(connection.models);
            }

            // List collections in current database
            if (connection.db) {
                try {
                    const collections = await connection.db.listCollections().toArray();
                    debugInfo.collections = collections.map(col => ({
                        name: col.name,
                        type: col.type,
                        options: col.options
                    }));
                } catch (error) {
                    debugInfo.collectionsError = error.message;
                }

                // List all databases
                try {
                    const admin = connection.db.admin();
                    const dbList = await admin.listDatabases();
                    debugInfo.databases = dbList.databases.map(db => ({
                        name: db.name,
                        sizeOnDisk: db.sizeOnDisk,
                        empty: db.empty
                    }));
                } catch (error) {
                    debugInfo.databasesError = error.message;
                }

                // Get database stats
                try {
                    const stats = await connection.db.stats();
                    debugInfo.stats = {
                        collections: stats.collections,
                        objects: stats.objects,
                        dataSize: stats.dataSize,
                        storageSize: stats.storageSize,
                        indexes: stats.indexes
                    };
                } catch (error) {
                    debugInfo.statsError = error.message;
                }
            }

            return debugInfo;
        } catch (error) {
            logger.error('Failed to debug database state', { error: error.message });
            return { error: error.message };
        }
    }

    /**
     * Initialize database with essential collections
     * @static
     * @async
     * @param {Object} connection - Database connection
     * @returns {Promise<Object>} Initialization result
     */
    static async initializeEssentialCollections(connection) {
        try {
            if (!connection || !connection.db) {
                throw new Error('Invalid database connection');
            }

            const collections = [
                {
                    name: 'users',
                    schema: {
                        username: { type: String, required: true, unique: true },
                        email: { type: String, required: true, unique: true },
                        password: { type: String, required: true },
                        role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
                        status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
                        profile: {
                            firstName: String,
                            lastName: String,
                            avatar: String
                        },
                        preferences: {
                            theme: { type: String, default: 'light' },
                            language: { type: String, default: 'en' },
                            notifications: { type: Boolean, default: true }
                        },
                        metadata: {
                            createdAt: { type: Date, default: Date.now },
                            updatedAt: { type: Date, default: Date.now },
                            lastLoginAt: Date,
                            loginCount: { type: Number, default: 0 }
                        }
                    },
                    indexes: [
                        { email: 1 },
                        { username: 1 },
                        { 'metadata.createdAt': 1 },
                        { status: 1, role: 1 }
                    ]
                },
                {
                    name: 'organizations',
                    schema: {
                        name: { type: String, required: true },
                        slug: { type: String, required: true, unique: true },
                        type: { 
                            type: String, 
                            enum: ['business', 'nonprofit', 'government', 'personal'], 
                            default: 'business' 
                        },
                        status: { 
                            type: String, 
                            enum: ['active', 'inactive', 'suspended', 'pending'], 
                            default: 'active' 
                        },
                        contact: {
                            email: { type: String, required: true },
                            phone: String,
                            website: String,
                            address: {
                                street: String,
                                city: String,
                                state: String,
                                country: String,
                                postalCode: String
                            }
                        },
                        ownership: {
                            ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                            ownerRole: { type: String, default: 'owner' }
                        },
                        settings: {
                            timezone: { type: String, default: 'UTC' },
                            currency: { type: String, default: 'USD' },
                            language: { type: String, default: 'en' }
                        },
                        metadata: {
                            createdAt: { type: Date, default: Date.now },
                            updatedAt: { type: Date, default: Date.now }
                        }
                    },
                    indexes: [
                        { slug: 1 },
                        { 'ownership.ownerId': 1 },
                        { type: 1, status: 1 },
                        { 'metadata.createdAt': 1 }
                    ]
                },
                {
                    name: 'sessions',
                    schema: {
                        sessionId: { type: String, required: true, unique: true },
                        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                        data: mongoose.Schema.Types.Mixed,
                        ipAddress: String,
                        userAgent: String,
                        lastActivityAt: { type: Date, default: Date.now },
                        expiresAt: { 
                            type: Date, 
                            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                        },
                        metadata: {
                            createdAt: { type: Date, default: Date.now }
                        }
                    },
                    indexes: [
                        { sessionId: 1 },
                        { userId: 1 },
                        { expiresAt: 1 },
                        { lastActivityAt: 1 }
                    ]
                },
                {
                    name: 'audit_logs',
                    schema: {
                        eventType: { type: String, required: true },
                        userId: mongoose.Schema.Types.ObjectId,
                        tenantId: String,
                        resource: String,
                        action: { type: String, required: true },
                        result: { type: String, enum: ['success', 'failure', 'pending'] },
                        timestamp: { type: Date, default: Date.now },
                        ipAddress: String,
                        userAgent: String,
                        details: mongoose.Schema.Types.Mixed,
                        metadata: mongoose.Schema.Types.Mixed
                    },
                    indexes: [
                        { timestamp: 1 },
                        { userId: 1, timestamp: 1 },
                        { eventType: 1, timestamp: 1 },
                        { tenantId: 1, timestamp: 1 }
                    ]
                },
                {
                    name: 'notifications',
                    schema: {
                        recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                        type: { 
                            type: String, 
                            enum: ['info', 'warning', 'error', 'success'], 
                            default: 'info' 
                        },
                        title: { type: String, required: true },
                        message: { type: String, required: true },
                        data: mongoose.Schema.Types.Mixed,
                        status: { 
                            type: String, 
                            enum: ['unread', 'read', 'archived'], 
                            default: 'unread' 
                        },
                        priority: { 
                            type: String, 
                            enum: ['low', 'normal', 'high', 'urgent'], 
                            default: 'normal' 
                        },
                        expiresAt: Date,
                        metadata: {
                            createdAt: { type: Date, default: Date.now },
                            readAt: Date,
                            archivedAt: Date
                        }
                    },
                    indexes: [
                        { recipientId: 1, status: 1 },
                        { 'metadata.createdAt': 1 },
                        { type: 1, priority: 1 },
                        { expiresAt: 1 }
                    ]
                }
            ];

            const results = [];

            for (const collectionConfig of collections) {
                try {
                    // Create mongoose schema
                    const schema = new mongoose.Schema(collectionConfig.schema, {
                        timestamps: true,
                        versionKey: false,
                        strict: true
                    });

                    // Add indexes to schema
                    if (collectionConfig.indexes) {
                        for (const index of collectionConfig.indexes) {
                            schema.index(index);
                        }
                    }

                    // Create model
                    const Model = connection.model(collectionConfig.name, schema);

                    // Ensure indexes are created
                    await Model.ensureIndexes();

                    results.push({
                        collection: collectionConfig.name,
                        status: 'success',
                        message: 'Collection and model created successfully'
                    });

                    logger.info(`Collection initialized: ${collectionConfig.name}`);

                } catch (error) {
                    results.push({
                        collection: collectionConfig.name,
                        status: 'error',
                        error: error.message
                    });

                    logger.error(`Failed to initialize collection: ${collectionConfig.name}`, {
                        error: error.message
                    });
                }
            }

            return {
                success: true,
                message: 'Database initialization completed',
                results,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Failed to initialize essential collections', { error: error.message });
            throw error;
        }
    }

    /**
     * Create sample data for testing
     * @static
     * @async
     * @param {Object} connection - Database connection
     * @returns {Promise<Object>} Sample data creation result
     */
    static async createSampleData(connection) {
        try {
            const results = [];

            // Create sample user
            const User = connection.model('users');
            const existingUser = await User.findOne({ email: 'admin@insightserenity.com' });
            
            if (!existingUser) {
                const sampleUser = new User({
                    username: 'admin',
                    email: 'admin@insightserenity.com',
                    password: '$2b$12$sample.hash.for.testing', // In real app, hash properly
                    role: 'superadmin',
                    status: 'active',
                    profile: {
                        firstName: 'System',
                        lastName: 'Administrator'
                    }
                });

                await sampleUser.save();
                results.push({
                    type: 'user',
                    status: 'created',
                    id: sampleUser._id
                });
            } else {
                results.push({
                    type: 'user',
                    status: 'exists',
                    id: existingUser._id
                });
            }

            // Create sample organization
            const Organization = connection.model('organizations');
            const existingOrg = await Organization.findOne({ slug: 'default-org' });

            if (!existingOrg) {
                const user = await User.findOne({ email: 'admin@insightserenity.com' });
                
                const sampleOrg = new Organization({
                    name: 'Default Organization',
                    slug: 'default-org',
                    type: 'business',
                    status: 'active',
                    contact: {
                        email: 'contact@insightserenity.com',
                        website: 'https://insightserenity.com'
                    },
                    ownership: {
                        ownerId: user._id,
                        ownerRole: 'owner'
                    }
                });

                await sampleOrg.save();
                results.push({
                    type: 'organization',
                    status: 'created',
                    id: sampleOrg._id
                });
            } else {
                results.push({
                    type: 'organization',
                    status: 'exists',
                    id: existingOrg._id
                });
            }

            // Create sample notification
            const Notification = connection.model('notifications');
            const user = await User.findOne({ email: 'admin@insightserenity.com' });
            
            const sampleNotification = new Notification({
                recipientId: user._id,
                type: 'info',
                title: 'Welcome to InsightSerenity',
                message: 'Your admin account has been set up successfully.',
                priority: 'normal'
            });

            await sampleNotification.save();
            results.push({
                type: 'notification',
                status: 'created',
                id: sampleNotification._id
            });

            return {
                success: true,
                message: 'Sample data created successfully',
                results,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Failed to create sample data', { error: error.message });
            throw error;
        }
    }

    /**
     * Comprehensive database repair and initialization
     * @static
     * @async
     * @param {Object} connection - Database connection
     * @returns {Promise<Object>} Repair result
     */
    static async repairAndInitialize(connection) {
        try {
            const repairResult = {
                debug: null,
                initialization: null,
                sampleData: null,
                finalState: null
            };

            // Step 1: Debug current state
            logger.info('Step 1: Debugging current database state...');
            repairResult.debug = await this.debugDatabaseState(connection);

            // Step 2: Initialize essential collections
            logger.info('Step 2: Initializing essential collections...');
            repairResult.initialization = await this.initializeEssentialCollections(connection);

            // Step 3: Create sample data
            logger.info('Step 3: Creating sample data...');
            repairResult.sampleData = await this.createSampleData(connection);

            // Step 4: Final state check
            logger.info('Step 4: Checking final database state...');
            repairResult.finalState = await this.debugDatabaseState(connection);

            logger.info('Database repair and initialization completed successfully');

            return {
                success: true,
                message: 'Database repair and initialization completed',
                details: repairResult,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Database repair and initialization failed', { error: error.message });
            throw error;
        }
    }
}

module.exports = DatabaseDebugHelper;