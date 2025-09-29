# 📚 Platform Utility Library

A comprehensive, enterprise-grade utility library providing essential tools for building robust, scalable applications. This library includes validators, formatters, helpers, error handling, logging, and constant definitions.

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Installation](#installation)
- [Core Modules](#core-modules)
  - [Error Handling](#error-handling)
  - [Logging](#logging)
  - [Async Handler](#async-handler)
  - [Response Formatter](#response-formatter)
- [Validators](#validators)
  - [Common Validators](#common-validators)
  - [Auth Validators](#auth-validators)
  - [User Validators](#user-validators)
  - [Organization Validators](#organization-validators)
  - [Custom Validators](#custom-validators)
- [Helpers](#helpers)
  - [Crypto Helper](#crypto-helper)
  - [String Helper](#string-helper)
  - [Date Helper](#date-helper)
  - [Email Helper](#email-helper)
  - [Cache Helper](#cache-helper)
  - [File Helper](#file-helper)
  - [Pagination Helper](#pagination-helper)
  - [Sanitization Helper](#sanitization-helper)
  - [Validation Helper](#validation-helper)
  - [Encryption Helper](#encryption-helper)
- [Formatters](#formatters)
  - [Date Formatter](#date-formatter)
  - [Currency Formatter](#currency-formatter)
  - [Number Formatter](#number-formatter)
  - [Text Formatter](#text-formatter)
- [Constants](#constants)
  - [Error Codes](#error-codes)
  - [Status Codes](#status-codes)
  - [Permissions](#permissions)
  - [Roles](#roles)
  - [Compliance Frameworks](#compliance-frameworks)
  - [Alert Types](#alert-types)
  - [Incident Types](#incident-types)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Overview

This utility library provides a comprehensive set of tools designed for enterprise applications, offering:

- ✅ **Type Safety**: Comprehensive validation and type checking
- 🔒 **Security**: Built-in sanitization, encryption, and security helpers
- 🚀 **Performance**: Optimized algorithms with caching and async handling
- 📊 **Monitoring**: Detailed logging, metrics, and error tracking
- 🌍 **Internationalization**: Multi-locale support for formatting
- 🏢 **Enterprise Ready**: Compliance, audit trails, and business rules

## Directory Structure

```
shared/lib/utils/
├── README.md                 # This file
├── index.js                  # Main export file
├── app-error.js             # Application error class
├── logger.js                # Logging utility
├── async-handler.js         # Async operation handler
├── response-formatter.js    # API response formatter
├── validators/              # Validation utilities
│   ├── common-validators.js
│   ├── auth-validators.js
│   ├── user-validators.js
│   ├── organization-validators.js
│   └── custom-validators.js
├── helpers/                 # Helper utilities
│   ├── crypto-helper.js
│   ├── string-helper.js
│   ├── date-helper.js
│   ├── email-helper.js
│   ├── cache-helper.js
│   ├── file-helper.js
│   ├── pagination-helper.js
│   ├── slug-helper.js
│   ├── sanitization-helper.js
│   ├── validation-helper.js
│   └── encryption-helper.js
├── formatters/             # Formatting utilities
│   ├── date-formatter.js
│   ├── currency-formatter.js
│   ├── number-formatter.js
│   └── text-formatter.js
└── constants/              # Constant definitions
    ├── error-codes.js
    ├── status-codes.js
    ├── permissions.js
    ├── roles.js
    ├── compliance-frameworks.js
    ├── alert-types.js
    └── incident-types.js
```

## Installation

### Install Dependencies

```bash
npm install winston winston-daily-rotate-file moment moment-timezone validator express-validator bcryptjs jsonwebtoken uuid lru-cache isomorphic-dompurify
```

### Import the Library

```javascript
// Import entire library
const utils = require('shared/lib/utils');

// Import specific modules
const { AppError, Logger, AsyncHandler } = require('shared/lib/utils');

// Import specific categories
const { validators, helpers, formatters, constants } = require('shared/lib/utils');
```

## Core Modules

### Error Handling

The `AppError` class provides comprehensive error management with recovery strategies, pattern analysis, and monitoring integration.

```javascript
const { AppError, ErrorHandler, ErrorAggregator } = require('shared/lib/utils');

// Creating errors
const notFoundError = AppError.notFound('User');
const validationError = AppError.validation('Invalid input', [
  { field: 'email', message: 'Invalid email format' }
]);

// Using error handler middleware
const errorHandler = new ErrorHandler({
  logger: console,
  includeStackTrace: process.env.NODE_ENV !== 'production'
});

app.use(errorHandler.middleware());

// Error aggregation for monitoring
const aggregator = new ErrorAggregator();
aggregator.add(error);
const stats = aggregator.getStats();

// Error recovery
const error = new AppError('Network timeout', {
  code: 'TIMEOUT',
  isRetryable: true
});

const recovery = error.getRecoveryInstructions();
console.log(recovery.strategy); // 'retry_with_backoff'
console.log(recovery.steps);    // Recovery steps

// Pattern analysis
const analysis = error.analyzePattern();
if (analysis.isTransient) {
  // Implement retry logic
}
```

### Logging

The `Logger` class provides structured logging with multiple transports, analytics, and custom filtering.

```javascript
const { Logger } = require('shared/lib/utils');

// Create logger instance
const logger = new Logger({
  serviceName: 'api-service',
  logLevel: 'debug',
  enableAnalytics: true,
  enableMetrics: true
});

// Basic logging
logger.info('User logged in', { userId: '123', ip: '192.168.1.1' });
logger.error('Database connection failed', { error: err });
logger.debug('Processing request', { requestId: 'req-123' });

// Structured logging
logger.logStructured('info', 'Payment processed', {
  transactionId: 'txn-456',
  amount: 99.99,
  currency: 'USD'
});

// Audit logging
logger.audit({
  actor: 'user@example.com',
  action: 'UPDATE_SETTINGS',
  resource: 'organization/123',
  result: 'success',
  ip: req.ip
});

// Security events
logger.security({
  severity: 'high',
  category: 'authentication',
  description: 'Multiple failed login attempts',
  source: req.ip,
  action: 'block_ip'
});

// Performance tracking
const timer = logger.startTimer('database-query');
// ... perform operation
timer({ rows: 100 }); // Logs with duration

// Custom transports
const { DatabaseTransport, WebhookTransport } = require('shared/lib/utils');

logger.addTransport(new DatabaseTransport({
  tableName: 'logs',
  batchSize: 100
}));

logger.addTransport(new WebhookTransport({
  url: 'https://api.example.com/logs',
  batchMode: true
}));

// Analytics
const report = logger.getAnalyticsReport();
console.log(report.errorPatterns);
console.log(report.performanceSummary);
```

### Async Handler

The `AsyncHandler` class provides comprehensive async operation management with retry logic, circuit breakers, and parallel execution.

```javascript
const { AsyncHandler } = require('shared/lib/utils');

const handler = AsyncHandler.getInstance();

// Wrap Express routes
app.get('/users', handler.wrap(async (req, res) => {
  const users = await User.findAll();
  res.json(users);
}));

// Retry with exponential backoff
const result = await handler.withRetry(
  async () => {
    return await externalAPI.call();
  },
  {
    maxRetries: 5,
    exponentialBackoff: true,
    retryCondition: (error) => error.code === 'ETIMEDOUT'
  }
);

// Circuit breaker pattern
const protectedFunction = handler.createCircuitBreaker(
  async () => {
    return await unreliableService.call();
  },
  {
    threshold: 5,
    timeout: 60000,
    fallback: () => ({ status: 'service unavailable' })
  }
);

// Parallel execution with concurrency limit
const results = await handler.parallel(
  [fetchUser, fetchOrders, fetchPayments],
  { concurrency: 2, stopOnError: false }
);

// Batch processing
const processed = await handler.batch(
  largeDataset,
  async (item) => {
    return await processItem(item);
  },
  10 // batch size
);

// Memoization
const memoized = handler.memoize(expensiveFunction, {
  ttl: 300000, // 5 minutes
  keyGenerator: (arg1, arg2) => `${arg1}-${arg2}`
});
```

### Response Formatter

The `ResponseFormatter` class standardizes API responses across your application.

```javascript
const { ResponseFormatter } = require('shared/lib/utils');

// Success responses
const successResponse = ResponseFormatter.success(userData, 'User retrieved successfully');
const createdResponse = ResponseFormatter.created(newUser, 'User created', '/users/123');

// Paginated responses
const paginatedResponse = ResponseFormatter.paginated(
  users,
  { page: 1, limit: 20, total: 100 },
  'Users retrieved'
);

// Error responses
const errorResponse = ResponseFormatter.error('Invalid request', 400, 'INVALID_INPUT');
const validationResponse = ResponseFormatter.validationError([
  { field: 'email', message: 'Invalid email format' }
]);

// Send response
ResponseFormatter.send(res, successResponse);

// Special responses
const noContent = ResponseFormatter.noContent();
const notFound = ResponseFormatter.notFound('User', 'user-123');
const unauthorized = ResponseFormatter.unauthorized();
const rateLimited = ResponseFormatter.tooManyRequests(60);
```

## Validators

### Common Validators

General-purpose validation rules for common data types.

```javascript
const { validators } = require('shared/lib/utils');
const { CommonValidators } = validators.common;

// Express route with validation
app.post('/api/resource',
  CommonValidators.mongoId('resourceId'),
  CommonValidators.email('email', { required: true, normalize: true }),
  CommonValidators.phoneNumber('phone', { locale: 'en-US' }),
  CommonValidators.url('website', { protocols: ['https'] }),
  CommonValidators.date('birthDate', {
    before: new Date(),
    after: new Date('1900-01-01')
  }),
  CommonValidators.stringLength('description', { min: 10, max: 500 }),
  CommonValidators.numberRange('age', { min: 18, max: 120, integer: true }),
  CommonValidators.enum('status', ['active', 'inactive', 'pending']),
  CommonValidators.pagination(),
  CommonValidators.checkValidation(),
  async (req, res) => {
    // Validated data available in req.body
    res.json({ success: true });
  }
);

// File upload validation
app.post('/upload',
  upload.single('document'),
  CommonValidators.fileUpload('document', {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['application/pdf', 'image/jpeg']
  }),
  (req, res) => {
    // File validated
  }
);
```

### Auth Validators

Authentication and authorization validation rules.

```javascript
const { AuthValidators } = validators.auth;

// Login validation
app.post('/auth/login',
  AuthValidators.login(),
  AuthValidators.checkValidation(),
  async (req, res) => {
    // Login logic
  }
);

// Registration with strong password
app.post('/auth/register',
  AuthValidators.register(),
  AuthValidators.checkValidation(),
  async (req, res) => {
    // Registration logic
  }
);

// Protected route with JWT
app.get('/api/protected',
  AuthValidators.jwtToken(),
  AuthValidators.isAuthenticated(),
  AuthValidators.permissions(['resource:read']),
  async (req, res) => {
    // Protected resource
  }
);

// Role-based access
app.delete('/api/admin/users/:id',
  AuthValidators.isAuthenticated(),
  AuthValidators.roles(['admin', 'super-admin']),
  async (req, res) => {
    // Admin-only operation
  }
);
```

### User Validators

User-specific validation rules.

```javascript
const { UserValidators } = validators.user;

// Create user
app.post('/api/users',
  UserValidators.createUser(),
  UserValidators.checkValidation(),
  async (req, res) => {
    const user = await User.create(req.body);
    res.json(user);
  }
);

// Update profile
app.put('/api/users/:userId/profile',
  UserValidators.updateProfile(),
  UserValidators.checkValidation(),
  async (req, res) => {
    // Update profile logic
  }
);

// Search users
app.get('/api/users/search',
  UserValidators.searchUsers(),
  UserValidators.checkValidation(),
  async (req, res) => {
    const { q, role, status, page, limit } = req.query;
    // Search logic
  }
);
```

### Organization Validators

Organization and team management validation.

```javascript
const { OrganizationValidators } = validators.organization;

// Create organization
app.post('/api/organizations',
  OrganizationValidators.createOrganization(),
  OrganizationValidators.checkBusinessRules(),
  async (req, res) => {
    // Create organization
  }
);

// Create project
app.post('/api/organizations/:organizationId/projects',
  OrganizationValidators.createProject(),
  OrganizationValidators.checkValidation(),
  async (req, res) => {
    // Create project with validated budget and dates
  }
);

// Budget allocation
app.post('/api/organizations/:organizationId/budget',
  OrganizationValidators.allocateBudget(),
  OrganizationValidators.checkBusinessRules(),
  async (req, res) => {
    // Allocate budget with validation
  }
);
```

## Helpers

### Crypto Helper

Cryptographic operations and security utilities.

```javascript
const { helpers } = require('shared/lib/utils');
const { CryptoHelper } = helpers.crypto;

// Password hashing
const hashedPassword = await CryptoHelper.hashPassword('userPassword123');
const isValid = await CryptoHelper.comparePassword('userPassword123', hashedPassword);

// Encryption/Decryption
const encrypted = CryptoHelper.encrypt('sensitive data', 'encryption-key');
const decrypted = CryptoHelper.decrypt(encrypted, 'encryption-key');

// Generate tokens
const token = CryptoHelper.generateToken(32); // 32 bytes
const uuid = CryptoHelper.generateUUID();

// JWT operations
const jwt = CryptoHelper.generateJWT(
  { userId: '123', email: 'user@example.com' },
  'jwt-secret',
  { expiresIn: '24h' }
);
const payload = CryptoHelper.verifyJWT(jwt, 'jwt-secret');

// Digital signatures
const signature = CryptoHelper.sign('message', 'private-key');
const isVerified = CryptoHelper.verify('message', signature, 'public-key');

// OTP generation
const otp = CryptoHelper.generateOTP(6);
```

### String Helper

String manipulation and text processing.

```javascript
const { StringHelper } = helpers.string;

// Case conversions
const camelCase = StringHelper.toCamelCase('hello-world-example'); // helloWorldExample
const snakeCase = StringHelper.toSnakeCase('HelloWorldExample');   // hello_world_example
const kebabCase = StringHelper.toKebabCase('Hello World Example'); // hello-world-example

// Text manipulation
const truncated = StringHelper.truncate('Long text...', 50, '...');
const slug = StringHelper.slugify('Hello World! 123'); // hello-world-123
const excerpt = StringHelper.excerpt('Long article text...', 100);

// Validation
const isEmail = StringHelper.isEmail('user@example.com');
const isUrl = StringHelper.isURL('https://example.com');
const isUUID = StringHelper.isUUID('550e8400-e29b-41d4-a716-446655440000');

// Formatting
const masked = StringHelper.maskString('4111111111111111', 4, 4); // 4111********1111
const highlighted = StringHelper.highlight('Hello world', 'world', '<mark>', '</mark>');

// Analysis
const wordCount = StringHelper.countWords('Hello world example');
const readingTime = StringHelper.calculateReadingTime('Long article text...');
```

### Date Helper

Date and time manipulation utilities.

```javascript
const { DateHelper } = helpers.date;

// Formatting
const formatted = DateHelper.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
const iso = DateHelper.toISO(new Date());

// Relative time
const relative = DateHelper.fromNow('2024-01-01'); // "2 months ago"
const timeUntil = DateHelper.timeUntil('2024-12-31'); // "in 10 months"

// Date arithmetic
const tomorrow = DateHelper.add(new Date(), 1, 'days');
const lastWeek = DateHelper.subtract(new Date(), 7, 'days');
const daysDiff = DateHelper.diff(date1, date2, 'days');

// Business days
const businessDays = DateHelper.businessDaysBetween(startDate, endDate);
const nextBusinessDay = DateHelper.addBusinessDays(new Date(), 5);

// Validation
const isValid = DateHelper.isValid('2024-02-30'); // false
const isBefore = DateHelper.isBefore(date1, date2);
const isBetween = DateHelper.isBetween(date, start, end);

// Timezone operations
const tokyoTime = DateHelper.toTimezone(new Date(), 'Asia/Tokyo');
const formatted = DateHelper.formatWithTimezone(date, 'America/New_York');
```

### Email Helper

Email validation, formatting, and processing.

```javascript
const { EmailHelper } = helpers.email;

// Validation
const isValid = EmailHelper.isValid('user@example.com');
const normalized = EmailHelper.normalize('User@EXAMPLE.COM'); // user@example.com

// Email parsing
const parts = EmailHelper.extractParts('john.doe+tag@company.com');
// { localPart: 'john.doe+tag', domain: 'company.com', username: 'john.doe' }

// Email classification
const isFree = EmailHelper.isFreeProvider('user@gmail.com'); // true
const isDisposable = EmailHelper.isDisposable('user@tempmail.com'); // true
const isCorporate = EmailHelper.isCorporate('user@company.com'); // true

// Gravatar
const avatarUrl = EmailHelper.getGravatarUrl('user@example.com', { size: 200 });

// Privacy
const masked = EmailHelper.mask('john.doe@example.com'); // j***e@example.com

// Verification
const token = EmailHelper.generateVerificationToken('user@example.com');
const result = EmailHelper.verifyToken(token);

// Bulk operations
const validation = EmailHelper.validateList([
  'valid@example.com',
  'invalid-email',
  'John Doe <john@example.com>'
]);
```

### Cache Helper

Caching and performance optimization.

```javascript
const { CacheHelper } = helpers.cache;

// Basic caching
await CacheHelper.set('user:123', userData, { ttl: 3600 });
const cached = await CacheHelper.get('user:123');
await CacheHelper.delete('user:123');

// Pattern-based operations
await CacheHelper.clearPattern('user:*');

// Get or load pattern
const data = await CacheHelper.getOrLoad(
  'expensive-operation',
  async () => {
    return await performExpensiveOperation();
  },
  { ttl: 600 }
);

// Memoization
const memoized = CacheHelper.memoize(expensiveFunction, {
  ttl: 300,
  namespace: 'my-function'
});

// Batch operations
await CacheHelper.mset({
  'key1': 'value1',
  'key2': 'value2'
});
const values = await CacheHelper.mget(['key1', 'key2']);

// Counters
await CacheHelper.increment('page-views', 1);
await CacheHelper.decrement('stock-count', 1);

// Sets
await CacheHelper.addToSet('active-users', 'user123');

// Statistics
const stats = CacheHelper.getStats();
console.log(`Cache hit rate: ${stats.hitRate * 100}%`);
```

### Sanitization Helper

Data sanitization and security.

```javascript
const { SanitizationHelper } = helpers.sanitization;

// HTML sanitization
const safeHtml = SanitizationHelper.sanitizeHTML(userInput, {
  allowedTags: ['p', 'br', 'strong', 'em'],
  allowedAttributes: ['href', 'class']
});

// String sanitization
const sanitized = SanitizationHelper.sanitizeString(input, {
  trim: true,
  removeSpecialChars: true,
  maxLength: 100
});

// SQL injection prevention
const safeSql = SanitizationHelper.sanitizeSQL(userQuery);

// Filename sanitization
const safeFilename = SanitizationHelper.sanitizeFilename('../../etc/passwd.txt');
// Returns: 'etcpasswd.txt'

// URL sanitization
const safeUrl = SanitizationHelper.sanitizeURL(userUrl, {
  allowedProtocols: ['https'],
  removeQueryParams: true
});

// Object sanitization
const safeObject = SanitizationHelper.sanitizeObject(userObject, {
  maxDepth: 5,
  maxKeys: 100,
  removeNullValues: true
});

// MongoDB query sanitization
const safeQuery = SanitizationHelper.sanitizeMongoQuery(userQuery);

// Credit card masking
const maskedCard = SanitizationHelper.maskSensitiveData('4111111111111111', {
  showFirst: 4,
  showLast: 4
}); // 4111********1111
```

## Formatters

### Date Formatter

Date formatting for different locales and formats.

```javascript
const { formatters } = require('shared/lib/utils');
const { DateFormatter } = formatters.date;

// Basic formatting
const formatted = DateFormatter.format(new Date(), 'MM/DD/YYYY');
const time = DateFormatter.formatTime(new Date(), '12h'); // 2:30 PM

// Relative formatting
const relative = DateFormatter.relative(date); // "2 hours ago"
const duration = DateFormatter.duration(3661000); // "1 hour 1 minute"

// Locale-specific formatting
const localized = DateFormatter.formatLocale(date, 'fr-FR', 'full');
// "lundi 15 janvier 2024"

// Range formatting
const range = DateFormatter.formatRange(startDate, endDate);
// "Jan 15 - Jan 20, 2024"

// Custom formats
const custom = DateFormatter.custom(date, 'MMMM Do YYYY, h:mm:ss a');
// "January 15th 2024, 2:30:45 pm"
```

### Currency Formatter

Multi-currency formatting with conversion support.

```javascript
const { CurrencyFormatter } = formatters.currency;

const formatter = new CurrencyFormatter({
  defaultCurrency: 'USD',
  defaultLocale: 'en-US'
});

// Basic formatting
const price = formatter.format(1234.56, 'USD'); // $1,234.56
const euro = formatter.format(1234.56, 'EUR'); // €1.234,56

// With options
const formatted = formatter.format(1234.56, 'USD', {
  showSymbol: true,
  showCode: false,
  decimals: 2,
  compact: false
});

// Compact notation
const compact = formatter.format(1500000, 'USD', { compact: true }); // $1.5M

// Accounting format
const accounting = formatter.formatAccounting(-1234.56, 'USD'); // ($1,234.56)

// Currency conversion
const converted = await formatter.convert(100, 'USD', 'EUR');

// Range formatting
const range = formatter.formatRange(100, 500, 'USD'); // $100 - $500

// Tax calculations
const tax = formatter.calculateTax(100, 8.5, {
  currency: 'USD',
  inclusive: false,
  additionalTaxes: [{ name: 'State Tax', rate: 2.5 }]
});

// Discount calculations
const discount = formatter.calculateDiscount(100, 15, {
  type: 'percentage',
  currency: 'USD'
});

// Multiple currencies
const prices = formatter.formatMultiple([10, 20, 30], 'EUR');

// Validation
const validation = formatter.validateAmount('$1,234.56', {
  min: 0,
  max: 10000,
  allowNegative: false
});
```

### Number Formatter

Number formatting utilities.

```javascript
const { NumberFormatter } = formatters.number;

// Basic formatting
const formatted = NumberFormatter.format(1234567.89);
// "1,234,567.89"

// Percentage
const percent = NumberFormatter.percentage(0.856, 2); // "85.60%"

// Compact notation
const compact = NumberFormatter.compact(1500000); // "1.5M"

// Ordinal numbers
const ordinal = NumberFormatter.ordinal(21); // "21st"

// File sizes
const fileSize = NumberFormatter.fileSize(1536); // "1.5 KB"

// Scientific notation
const scientific = NumberFormatter.scientific(1234567); // "1.23e+6"

// Currency formatting
const currency = NumberFormatter.currency(1234.56, 'USD'); // "$1,234.56"

// Roman numerals
const roman = NumberFormatter.toRoman(2024); // "MMXXIV"

// Ranges
const range = NumberFormatter.formatRange(10, 100); // "10-100"
```

### Text Formatter

Text formatting and manipulation.

```javascript
const { TextFormatter } = formatters.text;

// Text transformation
const title = TextFormatter.titleCase('hello world'); // "Hello World"
const sentence = TextFormatter.sentenceCase('HELLO WORLD'); // "Hello world"

// Truncation
const truncated = TextFormatter.truncate(longText, 100, '...');
const words = TextFormatter.truncateWords(longText, 20);

// Lists
const formatted = TextFormatter.formatList(['Apple', 'Banana', 'Orange']);
// "Apple, Banana, and Orange"

// Highlighting
const highlighted = TextFormatter.highlight(text, 'search term', {
  tag: 'mark',
  className: 'highlight'
});

// Templates
const result = TextFormatter.template(
  'Hello {{name}}, you have {{count}} messages',
  { name: 'John', count: 5 }
);

// Markdown to HTML
const html = TextFormatter.markdownToHtml('# Hello World');

// HTML to text
const text = TextFormatter.htmlToText('<p>Hello <b>World</b></p>');
// "Hello World"

// Word wrapping
const wrapped = TextFormatter.wrap(longText, 80);
```

## Constants

### Error Codes

Standardized error codes for consistent error handling.

```javascript
const { constants } = require('shared/lib/utils');
const { ErrorCodes, ErrorCodeHelper } = constants.errorCodes;

// Using error codes
if (error.code === ErrorCodes.UNAUTHORIZED) {
  // Handle unauthorized error
}

// Get error details
const message = ErrorCodeHelper.getMessage(ErrorCodes.VALIDATION_FAILED);
const httpStatus = ErrorCodeHelper.getHttpStatus(ErrorCodes.NOT_FOUND);
const isRetryable = ErrorCodeHelper.isRetryable(ErrorCodes.TIMEOUT);

// Create error with code
const error = ErrorCodeHelper.createError(ErrorCodes.RATE_LIMIT_EXCEEDED, {
  retryAfter: 60,
  limit: 100
});
```

### Permissions

Role-based access control permissions.

```javascript
const { Permissions, PermissionHelper } = constants.permissions;

// Check permissions
const hasPermission = PermissionHelper.hasPermission(
  user.permissions,
  Permissions.RESOURCE_WRITE
);

// Validate multiple permissions
const hasAll = PermissionHelper.hasAllPermissions(
  user.permissions,
  [Permissions.USER_READ, Permissions.USER_WRITE]
);

// Get permission details
const category = PermissionHelper.getPermissionCategory(Permissions.USER_DELETE);
const description = PermissionHelper.getPermissionDescription(Permissions.ADMIN_ACCESS);

// Permission inheritance
const inherited = PermissionHelper.getInheritedPermissions('admin');
```

### Roles

Role definitions and management.

```javascript
const { Roles, RoleHelper } = constants.roles;

// Get role permissions
const adminPermissions = RoleHelper.getRolePermissions(Roles.ADMIN);

// Check role hierarchy
const canAssign = RoleHelper.canAssignRole('manager', 'employee');

// Get role details
const roleInfo = RoleHelper.getRoleInfo(Roles.MODERATOR);
console.log(roleInfo.name, roleInfo.description, roleInfo.level);

// Find appropriate role
const role = RoleHelper.findRoleByPermissions(['user:read', 'user:write']);
```

## Best Practices

### 1. Error Handling

Always use the AppError class for consistent error handling:

```javascript
// ✅ Good
throw new AppError('Resource not found', {
  code: ErrorCodes.NOT_FOUND,
  statusCode: 404,
  context: { resourceId: id }
});

// ❌ Bad
throw new Error('Resource not found');
```

### 2. Input Validation

Always validate and sanitize user input:

```javascript
// ✅ Good
app.post('/api/users',
  UserValidators.createUser(),
  CommonValidators.checkValidation(),
  async (req, res) => {
    const sanitized = SanitizationHelper.sanitizeObject(req.body);
    // Process sanitized data
  }
);

// ❌ Bad
app.post('/api/users', async (req, res) => {
  // Using unvalidated data
  await User.create(req.body);
});
```

### 3. Async Operations

Use AsyncHandler for all async operations:

```javascript
// ✅ Good
app.get('/api/data', AsyncHandler.wrap(async (req, res) => {
  const data = await fetchData();
  res.json(data);
}));

// ❌ Bad
app.get('/api/data', async (req, res) => {
  try {
    const data = await fetchData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 4. Caching

Implement caching for expensive operations:

```javascript
// ✅ Good
const getData = CacheHelper.memoize(async (id) => {
  return await expensiveQuery(id);
}, { ttl: 300, namespace: 'user-data' });

// ❌ Bad
const getData = async (id) => {
  return await expensiveQuery(id); // No caching
};
```

### 5. Logging

Use structured logging for better observability:

```javascript
// ✅ Good
logger.info('User action', {
  userId: user.id,
  action: 'update_profile',
  metadata: { fields: ['email', 'name'] }
});

// ❌ Bad
console.log(`User ${user.id} updated profile`);
```

## Examples

### Complete API Endpoint Example

```javascript
const express = require('express');
const {
  AsyncHandler,
  AppError,
  ResponseFormatter,
  validators,
  helpers,
  Logger
} = require('shared/lib/utils');

const app = express();
const logger = new Logger({ serviceName: 'user-service' });
const { UserValidators } = validators.user;
const { CacheHelper, SanitizationHelper } = helpers;

// Create user endpoint with full validation, caching, and error handling
app.post('/api/users',
  // Validation middleware
  UserValidators.createUser(),
  validators.common.CommonValidators.checkValidation(),

  // Async handler wrapper
  AsyncHandler.wrap(async (req, res) => {
    // Start performance timer
    const timer = logger.startTimer('create-user');

    try {
      // Sanitize input
      const sanitizedData = SanitizationHelper.sanitizeObject(req.body, {
        removeNullValues: true,
        maxDepth: 3
      });

      // Check cache for duplicate
      const cacheKey = `user:email:${sanitizedData.email}`;
      const existingUser = await CacheHelper.get(cacheKey);

      if (existingUser) {
        throw AppError.conflict('User with this email already exists');
      }

      // Create user
      const user = await User.create(sanitizedData);

      // Cache the result
      await CacheHelper.set(cacheKey, user, { ttl: 3600 });

      // Log success
      logger.info('User created', {
        userId: user.id,
        email: user.email
      });

      // End timer
      timer({ userId: user.id });

      // Send response
      const response = ResponseFormatter.created(
        user,
        'User created successfully',
        `/api/users/${user.id}`
      );

      ResponseFormatter.send(res, response);

    } catch (error) {
      // Log error
      logger.error('User creation failed', {
        error: error.message,
        email: req.body.email
      });

      // Re-throw as AppError if needed
      if (!(error instanceof AppError)) {
        throw AppError.internal('User creation failed');
      }

      throw error;
    }
  })
);

// Error handling middleware
app.use(new ErrorHandler({ logger }).middleware());
```

### Background Job Example

```javascript
const { AsyncHandler, Logger, helpers } = require('shared/lib/utils');
const { DateHelper, CacheHelper } = helpers;

const logger = new Logger({ serviceName: 'job-processor' });
const handler = AsyncHandler.getInstance();

// Process daily reports with retry and caching
const processDailyReports = handler.createCircuitBreaker(
  async () => {
    const timer = logger.startTimer('daily-reports');

    // Check if already processed today
    const today = DateHelper.format(new Date(), 'YYYY-MM-DD');
    const cacheKey = `reports:processed:${today}`;

    const processed = await CacheHelper.get(cacheKey);
    if (processed) {
      logger.info('Reports already processed today');
      return;
    }

    // Process reports with retry logic
    const reports = await handler.withRetry(
      async () => {
        return await generateReports();
      },
      {
        maxRetries: 3,
        exponentialBackoff: true,
        onRetry: (error, attempt) => {
          logger.warn(`Report generation retry ${attempt}`, { error: error.message });
        }
      }
    );

    // Process in batches
    const results = await handler.batch(
      reports,
      async (report) => {
        return await processReport(report);
      },
      10 // batch size
    );

    // Mark as processed
    await CacheHelper.set(cacheKey, true, { ttl: 86400 });

    timer({ reportCount: results.length });
    logger.info('Daily reports processed', { count: results.length });

    return results;
  },
  {
    threshold: 3,
    timeout: 60000,
    fallback: async () => {
      logger.error('Report processing circuit breaker open');
      return [];
    }
  }
);

// Schedule job
setInterval(async () => {
  try {
    await processDailyReports();
  } catch (error) {
    logger.error('Daily report job failed', { error: error.message });
  }
}, 24 * 60 * 60 * 1000); // Run daily
```

## License

This utility library is proprietary and confidential.

## Support

For questions and support, please contact the development team or refer to the internal documentation.

---

*Last updated: 2024*
