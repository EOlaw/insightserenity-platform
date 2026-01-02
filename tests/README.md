# InsightSerenity Platform - Enterprise Testing System

This is a comprehensive, enterprise-level testing system built with Jest for the InsightSerenity Platform. The system provides robust unit, integration, and end-to-end testing capabilities with detailed HTML reporting.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Mock Utilities](#mock-utilities)
- [Test Fixtures](#test-fixtures)
- [Coverage Reports](#coverage-reports)
- [HTML Reports](#html-reports)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

### Testing Philosophy

This testing system follows industry best practices:

- **Unit Tests**: Test individual functions, services, controllers in isolation using mocks
- **Integration Tests**: Test interaction between components (service + database, controller + service)
- **End-to-End Tests**: Test complete user flows through the application
- **Test-Driven Development (TDD)**: Write tests first, then implementation
- **High Coverage**: Maintain 70%+ coverage across branches, functions, lines, and statements

### Technology Stack

- **Jest**: JavaScript testing framework
- **ts-jest**: TypeScript support for Jest
- **Supertest**: HTTP assertion library for testing routes
- **MongoDB Memory Server**: In-memory MongoDB for testing
- **jest-html-reporters**: HTML report generation

## Quick Start

### Running All Tests

```bash
npm run test
```

### Running Specific Test Suites

```bash
# Test client functionality
npm run test:client

# Test consultant functionality
npm run test:consultant

# Test consultations functionality
npm run test:consultations

# Test billing functionality
npm run test:billing

# Test authentication functionality
npm run test:auth
```

### Running Tests by Type

```bash
# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only E2E tests
npm run test:e2e
```

### Watch Mode (Development)

```bash
# Re-run tests on file changes
npm run test:watch
```

### Coverage Report

```bash
# Generate coverage report
npm run test:coverage

# Open HTML coverage report
open tests/coverage/index.html
```

### HTML Test Report

```bash
# Run tests (HTML report auto-generates)
npm run test

# Open HTML test report
npm run test:report
```

## Test Structure

```
tests/
├── unit/                    # Unit tests (isolated component testing)
│   ├── services/           # Service layer tests
│   │   ├── consultation-service.test.js
│   │   ├── user-service.test.js
│   │   └── payment-service.test.js
│   ├── controllers/        # Controller layer tests
│   │   └── consultation-controller.test.js
│   ├── routes/            # Route definition tests
│   │   └── consultation-routes.test.js
│   ├── models/            # Model/schema tests
│   ├── middleware/        # Middleware tests
│   └── utils/             # Utility function tests
├── integration/           # Integration tests
│   ├── api/              # API integration tests
│   └── database/         # Database integration tests
├── e2e/                  # End-to-end tests
│   └── flows/           # Complete user flow tests
├── fixtures/            # Test data fixtures
│   └── consultation.fixtures.js
├── mocks/              # Mock utilities and helpers
│   ├── database.mock.js
│   └── express.mock.js
├── config/             # Test configuration
│   ├── setup.js
│   ├── global-setup.js
│   └── global-teardown.js
├── coverage/          # Coverage reports (auto-generated)
└── reports/          # HTML test reports (auto-generated)
```

## Running Tests

### Available NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run test` | Run all tests with verbose output |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:client` | Run client-specific tests |
| `npm run test:consultant` | Run consultant-specific tests |
| `npm run test:consultations` | Run consultations-specific tests |
| `npm run test:billing` | Run billing-specific tests |
| `npm run test:auth` | Run authentication tests |
| `npm run test:unit` | Run only unit tests |
| `npm run test:integration` | Run only integration tests |
| `npm run test:e2e` | Run only E2E tests |
| `npm run test:report` | Open HTML test report |

### Running Individual Test Files

```bash
# Run a specific test file
npx jest tests/unit/services/consultation-service.test.js

# Run tests matching a pattern
npx jest --testNamePattern="createConsultation"

# Run tests in a specific directory
npx jest tests/unit/services/
```

## Writing Tests

### Unit Test Template

```javascript
/**
 * Unit Tests for [Component Name]
 * Tests [brief description of what's being tested]
 */

const { createMockModel, createMockDocument } = require('../../mocks/database.mock');
const { createMockRequest, createMockResponse, createMockNext } = require('../../mocks/express.mock');

// Mock dependencies
jest.mock('../../../path/to/dependency');

describe('[Component Name]', () => {
  let service;
  let mockDependency;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mocks
    mockDependency = require('../../../path/to/dependency');

    // Initialize component under test
    service = new Service();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('[method name]', () => {
    it('should [expected behavior]', async () => {
      // Arrange
      const input = { /* test data */ };
      mockDependency.someMethod.mockResolvedValue({ /* mocked response */ });

      // Act
      const result = await service.methodUnderTest(input);

      // Assert
      expect(result).toBeDefined();
      expect(mockDependency.someMethod).toHaveBeenCalledWith(input);
    });

    it('should throw error when [error condition]', async () => {
      // Arrange
      const invalidInput = { /* invalid data */ };

      // Act & Assert
      await expect(
        service.methodUnderTest(invalidInput)
      ).rejects.toThrow('Expected error message');
    });
  });
});
```

### Service Test Example

```javascript
describe('ConsultationService', () => {
  describe('createConsultation', () => {
    it('should successfully create a consultation when all data is valid', async () => {
      // Arrange
      const consultationData = {
        consultantId: '507f1f77bcf86cd799439011',
        clientId: '507f1f77bcf86cd799439012',
        title: 'Business Strategy Session',
        type: 'strategy_session',
        scheduledStart: new Date('2026-01-15T10:00:00Z'),
        scheduledEnd: new Date('2026-01-15T11:00:00Z')
      };

      mockConsultantModel.findById.mockResolvedValue(mockConsultant);
      mockClientModel.findById.mockResolvedValue(mockClient);
      mockConsultationModel.create.mockResolvedValue(mockCreatedConsultation);

      // Act
      const result = await consultationService.createConsultation(consultationData);

      // Assert
      expect(result).toBeDefined();
      expect(result._id).toBeDefined();
      expect(mockConsultationModel.create).toHaveBeenCalled();
    });
  });
});
```

### Controller Test Example

```javascript
describe('ConsultationController', () => {
  describe('createConsultation', () => {
    it('should successfully create a consultation and return 201', async () => {
      // Arrange
      req.body = { /* consultation data */ };
      req.user = { id: 'user123', role: 'client' };
      mockConsultationService.createConsultation.mockResolvedValue(mockConsultation);

      // Act
      await consultationController.createConsultation(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Object)
        })
      );
    });
  });
});
```

### Route Test Example

```javascript
describe('POST /api/consultations/book', () => {
  it('should create a consultation when authenticated', async () => {
    // Arrange
    const consultationData = { /* data */ };

    // Act
    const response = await request(app)
      .post('/api/consultations/book')
      .send(consultationData)
      .expect(201);

    // Assert
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
  });
});
```

## Mock Utilities

### Database Mocks (`tests/mocks/database.mock.js`)

```javascript
const { createMockModel, createMockDocument, createObjectId, createMockSession, createMockConnection } = require('../../mocks/database.mock');

// Create a mock Mongoose model
const mockUserModel = createMockModel('User');

// Create a mock document with Mongoose methods
const mockUser = createMockDocument({
  _id: createObjectId(),
  email: 'test@example.com',
  name: 'Test User'
});

// Create a mock MongoDB session for transactions
const mockSession = createMockSession();

// Create a mock database connection
const mockConnection = createMockConnection();
```

### Express Mocks (`tests/mocks/express.mock.js`)

```javascript
const { createMockRequest, createMockResponse, createMockNext, createMockUser, createMockConsultant } = require('../../mocks/express.mock');

// Create a mock Express request
const req = createMockRequest({
  params: { id: '123' },
  query: { page: '1' },
  body: { name: 'Test' },
  user: createMockUser()
});

// Create a mock Express response
const res = createMockResponse();

// Create a mock next function
const next = createMockNext();

// Check response data
const responseData = getResponseData(res);
const isSuccess = isSuccessResponse(res); // Check if 2xx
const isError = isErrorResponse(res);     // Check if 4xx/5xx
```

## Test Fixtures

Test fixtures provide reusable sample data for tests.

### Using Fixtures

```javascript
const {
  sampleConsultant,
  sampleClient,
  sampleConsultation,
  createConsultation,
  createConsultant,
  createClient
} = require('../../fixtures/consultation.fixtures');

// Use sample data directly
const consultant = sampleConsultant;

// Create new data with custom fields
const customConsultation = createConsultation({
  title: 'Custom Session',
  scheduledStart: new Date('2026-02-01T10:00:00Z')
});
```

### Creating New Fixtures

```javascript
// tests/fixtures/your-module.fixtures.js

const mongoose = require('mongoose');
const createObjectId = () => new mongoose.Types.ObjectId();

const sampleEntity = {
  _id: createObjectId(),
  field1: 'value1',
  field2: 'value2',
  // ... other fields
};

const createEntity = (overrides = {}) => ({
  ...sampleEntity,
  _id: createObjectId(),
  ...overrides
});

module.exports = {
  sampleEntity,
  createEntity
};
```

## Coverage Reports

### Coverage Thresholds

The testing system enforces minimum coverage thresholds:

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

Tests will fail if coverage drops below these thresholds.

### Viewing Coverage

Coverage reports are generated in multiple formats:

1. **Terminal Output**: Displayed after running tests
2. **HTML Report**: `tests/coverage/index.html`
3. **LCOV Report**: `tests/coverage/lcov.info` (for CI/CD tools)
4. **JSON Report**: `tests/coverage/coverage-final.json`

```bash
# Generate and view coverage
npm run test:coverage
open tests/coverage/index.html
```

### Coverage Configuration

Coverage settings are in `jest.config.js`:

```javascript
module.exports = {
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
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};
```

## HTML Reports

### Viewing HTML Test Reports

HTML reports are automatically generated after each test run:

```bash
# Run tests (report auto-generates)
npm run test

# Open the HTML report
npm run test:report
```

The HTML report includes:

- ✅ Pass/Fail status for all tests
- ⏱️ Execution time for each test
- 📊 Overall test statistics
- 🔍 Detailed failure messages
- 📈 Test suite hierarchy

Reports are located at: `tests/reports/test-report.html`

### Report Configuration

HTML report settings are in `jest.config.js`:

```javascript
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
]
```

## Best Practices

### 1. Test Structure (AAA Pattern)

```javascript
it('should do something', async () => {
  // Arrange: Set up test data and mocks
  const input = { /* ... */ };
  mockService.method.mockResolvedValue({ /* ... */ });

  // Act: Execute the code under test
  const result = await functionUnderTest(input);

  // Assert: Verify the results
  expect(result).toBe(expected);
  expect(mockService.method).toHaveBeenCalledWith(input);
});
```

### 2. Descriptive Test Names

✅ **Good**:
```javascript
it('should throw error when email is invalid')
it('should successfully create consultation when all data is valid')
it('should return 404 when consultation is not found')
```

❌ **Bad**:
```javascript
it('test1')
it('works')
it('error case')
```

### 3. Test Isolation

- Each test should be independent
- Use `beforeEach` to reset state
- Don't rely on test execution order
- Clear all mocks between tests

```javascript
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});
```

### 4. Mock External Dependencies

Always mock:
- Database calls
- External APIs
- File system operations
- Time-dependent code

```javascript
jest.mock('../../../shared/lib/database');
jest.mock('stripe');
jest.mock('axios');
```

### 5. Test Both Success and Error Cases

```javascript
describe('createUser', () => {
  it('should successfully create user with valid data', async () => {
    // Test happy path
  });

  it('should throw error when email already exists', async () => {
    // Test error case
  });

  it('should throw error when email is invalid', async () => {
    // Test validation error
  });
});
```

### 6. Use Test Fixtures

Reuse test data across tests:

```javascript
const { sampleUser, createUser } = require('../../fixtures/user.fixtures');

// Use consistent test data
const user = sampleUser;

// Or create custom variations
const customUser = createUser({ email: 'custom@example.com' });
```

### 7. Avoid Testing Implementation Details

✅ **Good** (test behavior):
```javascript
it('should return user data without password', async () => {
  const user = await service.getUserById(userId);
  expect(user.password).toBeUndefined();
});
```

❌ **Bad** (test implementation):
```javascript
it('should call delete on password property', async () => {
  // Don't test how it's done, test what it does
});
```

## Troubleshooting

### Common Issues

#### 1. Tests Timeout

```javascript
// Increase timeout in jest.config.js
testTimeout: 30000  // 30 seconds

// Or for specific test
it('long running test', async () => {
  // test code
}, 60000); // 60 seconds
```

#### 2. Mock Not Working

```javascript
// Ensure mock is defined BEFORE importing module
jest.mock('../../../path/to/module');
const MyClass = require('../../../path/to/MyClass');

// NOT:
const MyClass = require('../../../path/to/MyClass');
jest.mock('../../../path/to/module');  // TOO LATE!
```

#### 3. Database Connection Issues

Tests use MongoDB Memory Server, but if you face issues:

```javascript
// Check tests/config/global-setup.js
// Ensure proper cleanup in global-teardown.js
```

#### 4. Coverage Not Generated

```bash
# Ensure you're running with coverage flag
npm run test:coverage

# Not just:
npm run test
```

#### 5. Tests Not Found

```bash
# Check testMatch pattern in jest.config.js
testMatch: [
  '**/__tests__/**/*.+(ts|tsx|js)',
  '**/?(*.)+(spec|test).+(ts|tsx|js)'
]

# Ensure test files follow naming convention:
# - *.test.js
# - *.spec.js
```

### Debug Mode

```bash
# Run Jest in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand

# Enable verbose logging
DEBUG=true npm run test
```

## Contributing

### Adding New Tests

1. **Identify what to test**: Service, controller, route, utility, etc.
2. **Create test file**: Follow naming convention (`*.test.js`)
3. **Use appropriate location**:
   - `tests/unit/` for unit tests
   - `tests/integration/` for integration tests
   - `tests/e2e/` for E2E tests
4. **Use mock utilities**: Leverage existing mocks
5. **Follow AAA pattern**: Arrange, Act, Assert
6. **Write descriptive names**: Clear test descriptions
7. **Run tests**: Verify they pass
8. **Check coverage**: Ensure adequate coverage

### Adding New Mocks

1. Create mock file in `tests/mocks/`
2. Export reusable mock functions
3. Document usage in this README
4. Use in relevant tests

### Adding New Fixtures

1. Create fixture file in `tests/fixtures/`
2. Export sample data and creator functions
3. Document in this README
4. Use across multiple test files

## Maintenance

### Regular Tasks

- **Review coverage reports** weekly
- **Update mocks** when dependencies change
- **Add tests** for new features
- **Refactor tests** when code changes
- **Monitor test execution time**
- **Keep dependencies updated**

### Quality Checklist

- ✅ All tests pass
- ✅ Coverage meets thresholds (70%+)
- ✅ No flaky tests
- ✅ Tests run in reasonable time (<5 min)
- ✅ HTML report generates successfully
- ✅ Mocks are up to date
- ✅ Test names are descriptive
- ✅ Error cases covered

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

**Last Updated**: January 2026
**Maintainer**: InsightSerenity Platform Team
