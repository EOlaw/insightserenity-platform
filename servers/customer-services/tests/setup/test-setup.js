/**
 * @fileoverview Test Setup Configuration
 * @module servers/customer-services/tests/setup/test-setup
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-key';
process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';

// MongoDB test configuration
process.env.MONGODB_URI = 'mongodb://localhost:27017/customer-services-test';
process.env.MONGODB_TEST_TIMEOUT = '10000';

// Email service mock
process.env.EMAIL_ENABLED = 'false';
process.env.SMS_ENABLED = 'false';

// Rate limiting disabled for tests
process.env.RATE_LIMIT_ENABLED = 'false';

// Logging configuration
process.env.LOG_LEVEL = 'error'; // Only show errors during tests

// Global test timeout
jest.setTimeout(10000);

// Suppress console output during tests (optional)
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  // Keep these for debugging when needed
  _original: originalConsole
};

// Global test utilities
global.testUtils = {
  // Generate mock user data
  generateMockUser: (overrides = {}) => ({
    id: 'user_' + Math.random().toString(36).substring(7),
    email: `test${Date.now()}@example.com`,
    firstName: 'Test',
    lastName: 'User',
    tenantId: 'tenant_test',
    role: 'user',
    emailVerified: false,
    mfaEnabled: false,
    ...overrides
  }),

  // Generate mock JWT token
  generateMockToken: (userId = 'user_123') => {
    return `mock_token_${userId}_${Date.now()}`;
  },

  // Wait helper for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate tenant ID
  generateTenantId: () => 'tenant_' + Math.random().toString(36).substring(7)
};

// Global setup before all tests
beforeAll(async () => {
  // Add any global setup here
  // For example: connect to test database, seed initial data, etc.
});

// Clean up after each test
afterEach(async () => {
  // Clear all mocks
  jest.clearAllMocks();
});

// Global teardown after all tests
afterAll(async () => {
  // Add any global cleanup here
  // For example: close database connections, clean up test data, etc.
  await new Promise(resolve => setTimeout(resolve, 500));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console._original.error('Unhandled Promise Rejection:', error);
});

// Export test utilities
module.exports = {
  testUtils: global.testUtils
};