/**
 * Jest Configuration for InsightSerenity Platform
 * Enterprise-level testing configuration with coverage and HTML reporting
 */

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src', '<rootDir>/servers'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  collectCoverage: true,
  coverageDirectory: '<rootDir>/tests/coverage',
  coverageReporters: ['html', 'text', 'lcov', 'json'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/.next/',
    '/coverage/'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  modulePaths: ['<rootDir>'],
  moduleDirectories: ['node_modules', 'src'],
  setupFilesAfterEnv: ['<rootDir>/tests/config/setup.js'],
  testTimeout: 30000,
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './tests/reports',
        filename: 'test-report.html',
        pageTitle: 'InsightSerenity Platform - Test Report',
        expand: true,
        openReport: false,
        includeFailureMsg: true,
        includeSuiteFailure: true
      }
    ]
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    '^@mocks/(.*)$': '<rootDir>/tests/mocks/$1'
  },
  globalSetup: '<rootDir>/tests/config/global-setup.js',
  globalTeardown: '<rootDir>/tests/config/global-teardown.js',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/', '/.next/']
};
