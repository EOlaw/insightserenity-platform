/**
 * Jest Global Setup
 * Runs once before all tests
 */

module.exports = async () => {
  console.log('\n🧪 Setting up test environment...\n');

  // Set environment to test
  process.env.NODE_ENV = 'test';

  // You can start test database, Redis, etc. here
  // For now, we'll use mocks

  console.log('✅ Test environment ready\n');
};
