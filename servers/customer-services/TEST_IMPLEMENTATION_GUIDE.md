# Complete Test Suite Implementation Guide

## 📁 File Placement Structure

Place the test files exactly as shown below:

```
servers/customer-services/
├── modules/
│   └── core-business/
│       └── authentication/
│           ├── __tests__/
│           │   ├── controllers/
│           │   │   └── auth-controller.test.js          ← Phase 1: Controller Tests
│           │   ├── services/
│           │   │   └── direct-auth-service.test.js      ← Phase 2: Service Tests
│           │   ├── validators/
│           │   │   └── auth-validators.test.js          ← Phase 3: Validator Tests
│           │   └── routes/
│           │       └── auth-routes.test.js              ← Already exists
│           ├── controllers/
│           ├── services/
│           ├── validators/
│           └── routes/
│
├── tests/
│   ├── integration/
│   │   └── authentication.integration.test.js           ← Phase 4: Integration Tests
│   ├── setup/
│   │   ├── test-setup.js                                ← Already exists
│   │   └── mock-data.js                                 ← Already exists
│   └── fixtures/
│       └── test-users.json                              ← Optional test data
│
├── jest.config.js                                       ← Already exists
├── package.json                                         ← Update with new scripts
└── app.js                                               ← Your Express app entry point
```

## 🔧 Installation & Setup

### Step 1: Install Additional Dependencies

```bash
cd servers/customer-services

npm install --save-dev \
  @types/jest@^29.5.8 \
  jest@^29.7.0 \
  supertest@^6.3.3 \
  mongodb-memory-server@^9.1.3 \
  jest-junit@^16.0.0 \
  jest-html-reporter@^3.10.2

# Or using yarn
yarn add -D \
  @types/jest@^29.5.8 \
  jest@^29.7.0 \
  supertest@^6.3.3 \
  mongodb-memory-server@^9.1.3 \
  jest-junit@^16.0.0 \
  jest-html-reporter@^3.10.2
```

### Step 2: Create Test Directory Structure

```bash
# Create all necessary directories
mkdir -p modules/core-business/authentication/__tests__/{controllers,services,validators,routes}
mkdir -p tests/{integration,fixtures}
```

### Step 3: Copy Test Files

Copy each test file from the artifacts to its corresponding location:

1. **auth-controller.test.js** → `modules/core-business/authentication/__tests__/controllers/`
2. **direct-auth-service.test.js** → `modules/core-business/authentication/__tests__/services/`
3. **auth-validators.test.js** → `modules/core-business/authentication/__tests__/validators/`
4. **authentication.integration.test.js** → `tests/integration/`

## 📝 Update package.json

Add these test scripts to your `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:auth": "jest --testPathPattern=authentication",
    "test:unit": "jest --testPathPattern=__tests__",
    "test:integration": "jest --testPathPattern=tests/integration",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:verbose": "jest --verbose",
    "test:report": "jest --coverage --reporters=default --reporters=jest-junit --reporters=jest-html-reporter",
    "test:ci": "jest --ci --coverage --maxWorkers=2 --reporters=default --reporters=jest-junit",
    
    "test:controllers": "jest --testPathPattern=controllers",
    "test:services": "jest --testPathPattern=services",
    "test:validators": "jest --testPathPattern=validators",
    "test:routes": "jest --testPathPattern=routes",
    
    "test:phase1": "npm run test:controllers",
    "test:phase2": "npm run test:services",
    "test:phase3": "npm run test:validators",
    "test:phase4": "npm run test:integration",
    "test:all-phases": "npm run test:phase1 && npm run test:phase2 && npm run test:phase3 && npm run test:phase4"
  }
}
```

## 🚀 Running Tests

### Run All Tests
```bash
npm test
```

### Run by Phase

**Phase 1: Controller Tests**
```bash
npm run test:phase1
# or
npm run test:controllers
```

**Phase 2: Service Tests**
```bash
npm run test:phase2
# or
npm run test:services
```

**Phase 3: Validator Tests**
```bash
npm run test:phase3
# or
npm run test:validators
```

**Phase 4: Integration Tests**
```bash
npm run test:phase4
# or
npm run test:integration
```

**Run All Phases Sequentially**
```bash
npm run test:all-phases
```

### Run Authentication Tests Only
```bash
npm run test:auth
```

### Run with Coverage Report
```bash
npm run test:coverage
```

### Run in Watch Mode (Development)
```bash
npm run test:watch
```

### Generate Detailed Reports
```bash
npm run test:report
```

### Run for CI/CD Pipeline
```bash
npm run test:ci
```

## 📊 Expected Test Coverage

After implementing all phases, you should see coverage similar to:

```
--------------------------------|---------|----------|---------|---------|-------------------
File                            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
--------------------------------|---------|----------|---------|---------|-------------------
All files                       |   85.23 |    78.45 |   88.92 |   86.15 |                   
 authentication/controllers     |   92.45 |    85.67 |   95.23 |   93.12 |                   
  auth-controller.js            |   92.45 |    85.67 |   95.23 |   93.12 | 245-267,389       
 authentication/services        |   88.76 |    82.34 |   90.45 |   89.23 |                   
  direct-auth-service.js        |   88.76 |    82.34 |   90.45 |   89.23 | 456-489,678-701   
 authentication/validators      |   95.23 |    91.45 |   97.83 |   96.12 |                   
  auth-validators.js            |   95.23 |    91.45 |   97.83 |   96.12 | 89-92             
 authentication/routes          |     100 |      100 |     100 |     100 |                   
  auth-routes.js                |     100 |      100 |     100 |     100 |                   
--------------------------------|---------|----------|---------|---------|-------------------
```

## 🔍 Test Output Examples

### Successful Test Run
```
PASS  modules/core-business/authentication/__tests__/controllers/auth-controller.test.js (8.234s)
  AuthController Unit Tests
    registerUser
      ✓ should successfully register a new user with complete profile data (124ms)
      ✓ should return validation errors when registration data is invalid (42ms)
      ✓ should handle service errors during registration (38ms)
      ✓ should include optional marketing data when provided (45ms)
    loginUser
      ✓ should successfully authenticate user with valid credentials (98ms)
      ✓ should return MFA challenge when MFA is required (76ms)
      ✓ should return error when credentials are missing (23ms)
      ✓ should accept username instead of email for login (67ms)
      ✓ should include device and location information when provided (54ms)
    logoutUser
      ✓ should successfully logout user and invalidate tokens (89ms)
      ✓ should return error when user is not authenticated (18ms)
      ✓ should handle logout when only access token is present (45ms)
      ✓ should handle service errors during logout gracefully (34ms)

PASS  modules/core-business/authentication/__tests__/services/direct-auth-service.test.js (12.456s)
  DirectAuthService Unit Tests
    registerDirectUser
      ✓ should successfully register a new user with hashed password (156ms)
      ✓ should throw error when user already exists (89ms)
      ✓ should hash password with correct salt rounds (76ms)
      ✓ should generate verification token for email verification (92ms)
      ✓ should include userType and tenant information (67ms)
      ✓ should handle database errors during registration (45ms)

PASS  modules/core-business/authentication/__tests__/validators/auth-validators.test.js (5.678s)
  Authentication Validators Unit Tests
    validateRegistration
      ✓ should accept valid registration data with all required fields (34ms)
      ✓ should reject invalid email formats (156ms)
      ✓ should reject passwords that are too short (23ms)
      ✓ should reject passwords without uppercase letters (28ms)
      ✓ should reject passwords without lowercase letters (26ms)
      ✓ should reject passwords without numbers (24ms)
      ✓ should reject passwords without special characters (25ms)
      ✓ should accept passwords meeting all requirements (89ms)

PASS  tests/integration/authentication.integration.test.js (28.901s)
  Authentication Integration Tests
    Complete User Registration Flow
      ✓ should complete full registration process with email verification (3456ms)
      ✓ should prevent duplicate registration with same email (1234ms)
      ✓ should validate registration data and return detailed errors (567ms)
    Complete Login and Session Management Flow
      ✓ should complete full login process and create session (2345ms)
      ✓ should handle failed login attempts and account locking (4567ms)
      ✓ should reject login without required credentials (456ms)

Test Suites: 4 passed, 4 total
Tests:       128 passed, 128 total
Snapshots:   0 total
Time:        55.269s
```

## 🐛 Troubleshooting

### Issue: "Cannot find module" errors

**Solution:** Ensure all imports in test files match your actual file structure.

```javascript
// Update paths in test files to match your structure
const AuthController = require('../../controllers/auth-controller');
// Adjust '../..' based on test file location
```

### Issue: MongoDB Memory Server fails to start

**Solution:** Increase timeout for MongoDB setup:

```javascript
// In integration test file
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  // ... rest of setup
}, 60000); // Increase timeout to 60 seconds
```

### Issue: Tests pass individually but fail when run together

**Solution:** Ensure proper cleanup between tests:

```javascript
afterEach(async () => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Clear database collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
```

### Issue: Coverage not including certain files

**Solution:** Update Jest configuration:

```javascript
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    'modules/**/*.js',
    '!modules/**/__tests__/**',
    '!**/node_modules/**',
    '!**/tests/**'
  ]
};
```

### Issue: "express-validator" errors in validator tests

**Solution:** The validator tests need actual validator implementations. Create a mock validator file if needed:

```javascript
// modules/core-business/authentication/validators/auth-validators.js
const { body } = require('express-validator');

const validateRegistration = [
  body('email').isEmail().normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .matches(/[A-Z]/)
    .matches(/[a-z]/)
    .matches(/[0-9]/)
    .matches(/[!@#$%^&*]/),
  body('firstName').optional().trim(),
  body('lastName').optional().trim(),
  body('phoneNumber').optional().isMobilePhone()
];

// Export other validators...
module.exports = {
  validateRegistration,
  validateLogin,
  validateEmail,
  validatePassword,
  validatePasswordReset,
  validateTokenRefresh
};
```

## 📈 Next Steps After Implementation

### 1. Review Coverage Reports
```bash
npm run test:coverage
open test-reports/coverage/index.html
```

### 2. Set Coverage Thresholds

Update `jest.config.js`:

```javascript
module.exports = {
  // ... other config
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './modules/core-business/authentication/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
};
```

### 3. Add to CI/CD Pipeline

**GitHub Actions Example** (`.github/workflows/test.yml`):

```yaml
name: Run Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: |
          cd servers/customer-services
          npm ci
          
      - name: Run tests
        run: |
          cd servers/customer-services
          npm run test:ci
          
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./servers/customer-services/test-reports/coverage/lcov.info
```

### 4. Expand Test Suite

Apply the same testing patterns to other modules:
- MFA Controller, Service, Validators
- Password Controller, Service, Validators  
- OAuth Controller, Service, Validators
- Session Controller, Service
- Client Management module
- User Management module

### 5. Add E2E Tests

Create end-to-end tests at the root level:

```
tests/
└── e2e/
    ├── complete-auth-flow.e2e.test.js
    ├── multi-tenant-scenarios.e2e.test.js
    └── cross-module-workflows.e2e.test.js
```

## ✅ Verification Checklist

Before considering implementation complete, verify:

- [ ] All 4 test files are in correct locations
- [ ] All dependencies are installed
- [ ] `npm test` runs without errors
- [ ] Each phase passes individually
- [ ] Coverage reports are generated correctly
- [ ] Integration tests connect to MongoDB Memory Server
- [ ] All imports/paths are correct for your structure
- [ ] Environment variables are set in test setup
- [ ] Mock implementations match your actual code
- [ ] Test data/fixtures are appropriate
- [ ] CI/CD integration works (if applicable)

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
- [Express Validator](https://express-validator.github.io/docs/)

## 🎯 Summary

You now have a complete 4-phase test suite covering:

1. **Phase 1:** Controller unit tests (business logic orchestration)
2. **Phase 2:** Service layer tests (core authentication logic)
3. **Phase 3:** Validator tests (input validation rules)
4. **Phase 4:** Integration tests (end-to-end workflows)

This provides comprehensive coverage of your authentication module with clear separation of concerns and thorough testing of all critical paths.