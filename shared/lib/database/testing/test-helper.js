/**
 * @fileoverview TestHelper - Database testing utilities
 * @module shared/lib/database/testing/test-helper
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * @class TestHelper
 * @description Provides utilities for database testing
 */
class TestHelper {
    constructor() {
        this.mongoServer = null;
        this.connections = new Map();
    }

    /**
     * Sets up test database
     * @returns {Promise<string>} MongoDB URI
     */
    async setupTestDatabase() {
        this.mongoServer = await MongoMemoryServer.create();
        return this.mongoServer.getUri();
    }

    /**
     * Creates a test connection
     * @param {string} name - Connection name
     * @returns {Promise<mongoose.Connection>} Test connection
     */
    async createTestConnection(name = 'test') {
        if (!this.mongoServer) {
            await this.setupTestDatabase();
        }

        const uri = this.mongoServer.getUri();
        const connection = await mongoose.createConnection(uri);

        this.connections.set(name, connection);
        return connection;
    }

    /**
     * Clears all collections
     * @param {mongoose.Connection} connection - Database connection
     */
    async clearDatabase(connection) {
        const collections = await connection.db.collections();

        for (const collection of collections) {
            await collection.deleteMany({});
        }
    }

    /**
     * Drops all collections
     * @param {mongoose.Connection} connection - Database connection
     */
    async dropDatabase(connection) {
        await connection.dropDatabase();
    }

    /**
     * Closes all connections and stops server
     */
    async cleanup() {
        for (const [, connection] of this.connections) {
            await connection.close();
        }

        if (this.mongoServer) {
            await this.mongoServer.stop();
        }
    }

    /**
     * Creates mock data
     * @param {mongoose.Model} Model - Mongoose model
     * @param {Object} data - Mock data
     * @returns {Promise<Object>} Created document
     */
    async createMockData(Model, data) {
        return await Model.create(data);
    }

    /**
     * Creates multiple mock documents
     * @param {mongoose.Model} Model - Mongoose model
     * @param {Array} dataArray - Array of mock data
     * @returns {Promise<Array>} Created documents
     */
    async createManyMockData(Model, dataArray) {
        return await Model.insertMany(dataArray);
    }
}

module.exports = TestHelper;
