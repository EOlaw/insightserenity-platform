/**
 * @file Jest Configuration
 * @description Test configuration for admin server with comprehensive coverage
 * @version 3.0.0
 */

'use strict';

module.exports = {
    displayName: 'Admin Server',
    testEnvironment: 'node',
    rootDir: '.',
    roots: [
        '<rootDir>/test',
        '<rootDir>/modules',
        '<rootDir>/middleware',
        '<rootDir>/utils',
        '<rootDir>/config'
    ],
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/build/',
        '/dist/',
        '/coverage/',
        '/public/',
        '/uploads/',
        '/temp/',
        '/logs/'
    ],
    coverageDirectory: '<rootDir>/coverage',
    collectCoverageFrom: [
        'app.js',
        'server.js',
        'config/**/*.js',
        'middleware/**/*.js',
        'modules/**/*.js',
        'routes/**/*.js',
        'utils/**/*.js',
        '!**/node_modules/**',
        '!**/test/**',
        '!**/__tests__/**',
        '!**/coverage/**',
        '!**/*.test.js',
        '!**/*.spec.js',
        '!**/index.js'
    ],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        './modules/security-administration/': {
            branches: 90,
            functions: 90,
            lines: 90,
            statements: 90
        },
        './middleware/admin-auth.js': {
            branches: 95,
            functions: 95,
            lines: 95,
            statements: 95
        }
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@shared/(.*)$': '<rootDir>/../../shared/$1',
        '^@config/(.*)$': '<rootDir>/config/$1',
        '^@middleware/(.*)$': '<rootDir>/middleware/$1',
        '^@modules/(.*)$': '<rootDir>/modules/$1',
        '^@utils/(.*)$': '<rootDir>/utils/$1'
    },
    setupFiles: [
        '<rootDir>/test/setup.js'
    ],
    setupFilesAfterEnv: [
        '<rootDir>/test/setupAfterEnv.js'
    ],
    teardown: '<rootDir>/test/teardown.js',
    globals: {
        '__DEV__': false,
        '__TEST__': true,
        '__ADMIN__': true
    },
    testTimeout: 30000,
    verbose: true,
    forceExit: true,
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    detectOpenHandles: true,
    errorOnDeprecated: true,
    notifyMode: 'failure-change',
    moduleFileExtensions: [
        'js',
        'json'
    ],
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    reporters: [
        'default',
        ['jest-junit', {
            outputDirectory: './test-results',
            outputName: 'admin-server-junit.xml',
            suiteName: 'Admin Server Tests',
            usePathForSuiteName: true,
            classNameTemplate: '{classname}',
            titleTemplate: '{title}',
            ancestorSeparator: ' › ',
            addFileAttribute: true
        }],
        ['jest-html-reporter', {
            pageTitle: 'Admin Server Test Report',
            outputPath: './test-results/admin-server-test-report.html',
            includeFailureMsg: true,
            includeConsoleLog: true,
            dateFormat: 'yyyy-mm-dd HH:MM:ss',
            theme: 'darkTheme'
        }]
    ],
    collectCoverageFrom: [
        '**/*.js',
        '!**/node_modules/**',
        '!**/vendor/**',
        '!**/coverage/**',
        '!**/test/**',
        '!**/*.config.js',
        '!**/public/**'
    ],
    coverageReporters: [
        'text',
        'text-summary',
        'lcov',
        'html',
        'json',
        'cobertura'
    ],
    watchPlugins: [
        'jest-watch-typeahead/filename',
        'jest-watch-typeahead/testname'
    ],
    projects: [
        {
            displayName: 'Unit Tests',
            testMatch: ['<rootDir>/test/unit/**/*.test.js'],
            testEnvironment: 'node'
        },
        {
            displayName: 'Integration Tests',
            testMatch: ['<rootDir>/test/integration/**/*.test.js'],
            testEnvironment: 'node',
            globalSetup: '<rootDir>/test/integration/setup.js',
            globalTeardown: '<rootDir>/test/integration/teardown.js'
        },
        {
            displayName: 'E2E Tests',
            testMatch: ['<rootDir>/test/e2e/**/*.test.js'],
            testEnvironment: 'node',
            testTimeout: 60000,
            maxWorkers: 1
        }
    ],
    testResultsProcessor: '<rootDir>/test/utils/test-results-processor.js'
};