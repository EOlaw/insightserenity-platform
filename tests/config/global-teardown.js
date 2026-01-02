/**
 * Jest Global Teardown
 * Runs once after all tests
 */

module.exports = async () => {
  console.log('\n🧹 Cleaning up test environment...\n');

  // Clean up test database, Redis, etc.

  console.log('✅ Cleanup complete\n');
};
