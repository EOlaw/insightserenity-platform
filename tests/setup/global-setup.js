/**
 * @fileoverview Global Setup for E2E Tests
 * @module tests/setup/global-setup
 */

const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
  // Start in-memory MongoDB server for E2E tests
  const mongod = await MongoMemoryServer.create({
    instance: {
      dbName: 'e2e-test-db'
    }
  });

  const uri = mongod.getUri();
  
  // Store the MongoDB instance and URI for use in tests
  global.__MONGOD__ = mongod;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_URI_ADMIN = uri;
  process.env.MONGODB_URI_CUSTOMER = uri;

  console.log('\n🚀 Starting E2E Test Suite...');
  console.log(`📦 MongoDB Test Server: ${uri}\n`);

  // Additional global setup
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'e2e-test-jwt-secret';
  process.env.PORT = '0'; // Random available port

  // Wait for MongoDB to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));
};