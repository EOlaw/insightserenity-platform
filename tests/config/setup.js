/**
 * Jest Setup Configuration
 * Runs before each test file
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.MONGODB_URI = 'mongodb://localhost:27017/insightserenity-test';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key_for_testing';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_mock_key_for_testing';
process.env.SENDGRID_API_KEY = 'SG.test_mock_key_for_testing';

// Increase timeout for all tests
jest.setTimeout(30000);

// Global test utilities
global.console = {
  ...console,
  // Suppress console logs in tests unless DEBUG=true
  log: process.env.DEBUG ? console.log : jest.fn(),
  debug: process.env.DEBUG ? console.debug : jest.fn(),
  info: process.env.DEBUG ? console.info : jest.fn(),
  warn: console.warn,
  error: console.error,
};

// Mock Date for consistent testing
const DATE_TO_USE = new Date('2026-01-02T00:00:00.000Z');
global.Date = class extends Date {
  constructor(...args) {
    if (args.length === 0) {
      super(DATE_TO_USE);
    } else {
      super(...args);
    }
  }

  static now() {
    return DATE_TO_USE.getTime();
  }
};

// Fail tests on unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  throw reason;
});
