module.exports = {
  testEnvironment: 'node',
  projects: [
    '<rootDir>/servers/customer-services/jest.config.js',
    '<rootDir>/servers/admin-server/jest.config.js',
    '<rootDir>/servers/gateway/jest.config.js',
    '<rootDir>/tests/jest.config.js'
  ],
  coverageDirectory: 'test-reports/coverage',
  collectCoverageFrom: [
    'servers/**/*.js',
    'shared/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/__tests__/**'
  ],
  coverageReporters: ['text', 'lcov', 'json', 'html'],
  verbose: true
};