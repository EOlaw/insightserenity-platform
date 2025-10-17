module.exports = {
  displayName: 'customer-services',
  testEnvironment: 'node',
  rootDir: './',
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/tests/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/test-setup.js'],
  coverageDirectory: '../../test-reports/coverage/customer-services',
  collectCoverageFrom: [
    'modules/**/*.js',
    '!modules/**/__tests__/**',
    '!**/node_modules/**'
  ],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../../shared/lib/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)'
  ],
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '../../test-reports',
      outputName: 'customer-services-junit.xml',
      suiteName: 'Customer Services Tests'
    }]
  ],
  testTimeout: 10000
};