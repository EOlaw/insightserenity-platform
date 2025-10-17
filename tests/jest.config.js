module.exports = {
  displayName: 'e2e-tests',
  testEnvironment: 'node',
  rootDir: './',
  testMatch: [
    '**/e2e/**/*.test.js',
    '**/integration/**/*.test.js',
    '**/performance/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/setup/global-setup.js'],
  globalSetup: '<rootDir>/setup/global-setup.js',
  globalTeardown: '<rootDir>/setup/global-teardown.js',
  coverageDirectory: '../test-reports/coverage/e2e',
  testTimeout: 30000, // Longer timeout for E2E tests
  maxWorkers: 1 // Run E2E tests sequentially
};