# 📖 Platform Utility Library - API Documentation

## Version: 1.0.0

Comprehensive API reference for the Platform Utility Library, providing detailed documentation for all classes, methods, properties, and types.

---

## Table of Contents

- [Core Modules](#core-modules)
  - [AppError](#apperror)
  - [ErrorHandler](#errorhandler)
  - [ErrorAggregator](#erroraggregator)
  - [Logger](#logger)
  - [AsyncHandler](#asynchandler)
  - [ResponseFormatter](#responseformatter)
- [Validators](#validators)
  - [CommonValidators](#commonvalidators)
  - [AuthValidators](#authvalidators)
  - [UserValidators](#uservalidators)
  - [OrganizationValidators](#organizationvalidators)
  - [CustomValidators](#customvalidators)
- [Helpers](#helpers)
  - [CryptoHelper](#cryptohelper)
  - [StringHelper](#stringhelper)
  - [DateHelper](#datehelper)
  - [EmailHelper](#emailhelper)
  - [CacheHelper](#cachehelper)
  - [FileHelper](#filehelper)
  - [PaginationHelper](#paginationhelper)
  - [SlugHelper](#slughelper)
  - [SanitizationHelper](#sanitizationhelper)
  - [ValidationHelper](#validationhelper)
  - [EncryptionHelper](#encryptionhelper)
- [Formatters](#formatters)
  - [DateFormatter](#dateformatter)
  - [CurrencyFormatter](#currencyformatter)
  - [NumberFormatter](#numberformatter)
  - [TextFormatter](#textformatter)
- [Constants](#constants)
  - [ErrorCodes](#errorcodes)
  - [StatusCodes](#statuscodes)
  - [Permissions](#permissions)
  - [Roles](#roles)
  - [ComplianceFrameworks](#complianceframeworks)
  - [AlertTypes](#alerttypes)
  - [IncidentTypes](#incidenttypes)

---

## Core Modules

### AppError

**Path:** `shared/lib/utils/app-error.js`

#### Class: `AppError extends Error`

Custom error class with enhanced error handling capabilities.

##### Constructor

```typescript
new AppError(message: string, options?: ErrorOptions)
```

**Parameters:**
- `message` (string): Error message
- `options` (ErrorOptions): Optional configuration object
  - `id` (string): Unique error identifier
  - `code` (string): Error code (from ErrorCode constants)
  - `statusCode` (number): HTTP status code
  - `category` (string): Error category
  - `severity` (string): Error severity level
  - `context` (object): Additional context data
  - `metadata` (object): Error metadata
  - `details` (any): Detailed error information
  - `errors` (array): Sub-errors for aggregation
  - `isOperational` (boolean): Whether error is operational
  - `isRetryable` (boolean): Whether operation can be retried
  - `cause` (Error): Original error cause
  - `correlationId` (string): Request correlation ID
  - `requestId` (string): Request identifier
  - `userId` (string): User identifier
  - `tenantId` (string): Tenant identifier

##### Instance Methods

###### `analyzePattern(): PatternAnalysis`
Analyzes error pattern for recovery strategies.

**Returns:**
```typescript
{
  pattern: string | null,
  isTransient: boolean,
  isRetryable: boolean,
  suggestedStrategy: string | null,
  estimatedRecoveryTime: number | null
}
```

###### `getRecoveryInstructions(): RecoveryInstructions`
Gets detailed recovery instructions.

**Returns:**
```typescript
{
  strategy: string,
  steps: string[],
  metadata: object
}
```

###### `calculateImpactScore(): number`
Calculates error impact score (0-100).

###### `getUserMessage(): string`
Returns user-friendly error message.

###### `getDeveloperMessage(): string`
Returns developer-focused error message with debugging info.

###### `createFingerprint(): string`
Creates unique error fingerprint for deduplication.

###### `getMetrics(): ErrorMetrics`
Returns error metrics for monitoring.

###### `toJSON(includeStack?: boolean): object`
Converts error to JSON representation.

###### `toHTTPResponse(): object`
Formats error for HTTP response.

###### `toSentryFormat(): object`
Formats error for Sentry error tracking.

###### `log(logger: Logger): void`
Logs error using provided logger.

###### `report(reporter: Reporter): Promise<void>`
Reports error to monitoring service.

###### `is(code: string): boolean`
Checks if error matches specific code.

###### `addContext(key: string, value: any): AppError`
Adds context to error (chainable).

###### `addMetadata(key: string, value: any): AppError`
Adds metadata to error (chainable).

###### `clone(modifications?: object): AppError`
Creates clone of error with modifications.

###### `chain(error: Error): AppError`
Chains multiple errors together.

##### Static Methods

###### `AppError.unauthorized(message?: string, options?: object): AppError`
Creates unauthorized error (401).

###### `AppError.forbidden(message?: string, options?: object): AppError`
Creates forbidden error (403).

###### `AppError.notFound(resource?: string, options?: object): AppError`
Creates not found error (404).

###### `AppError.validation(message: string, errors?: array, options?: object): AppError`
Creates validation error (422).

###### `AppError.conflict(message?: string, options?: object): AppError`
Creates conflict error (409).

###### `AppError.rateLimit(message?: string, options?: object): AppError`
Creates rate limit error (429).

###### `AppError.database(message?: string, options?: object): AppError`
Creates database error (500).

###### `AppError.external(message?: string, options?: object): AppError`
Creates external service error (502).

###### `AppError.timeout(message?: string, options?: object): AppError`
Creates timeout error (504).

###### `AppError.internal(message?: string, options?: object): AppError`
Creates internal server error (500).

###### `AppError.businessLogic(message: string, options?: object): AppError`
Creates business logic violation error (422).

###### `AppError.wrap(error: Error, message?: string, options?: object): AppError`
Wraps existing error in AppError.

###### `AppError.fromValidation(validationResult: object): AppError`
Creates error from validation result.

###### `AppError.aggregate(errors: Error[], message?: string, options?: object): AppError`
Aggregates multiple errors into one.

###### `AppError.fromAxiosError(axiosError: object): AppError`
Creates error from Axios error.

###### `AppError.fromDatabaseError(dbError: object): AppError`
Creates error from database error.

###### `AppError.isOperational(error: Error): boolean`
Checks if error is operational.

---

### ErrorHandler

**Path:** `shared/lib/utils/app-error.js`

#### Class: `ErrorHandler`

Express error handling middleware.

##### Constructor

```typescript
new ErrorHandler(options?: ErrorHandlerOptions)
```

**Parameters:**
- `options` (ErrorHandlerOptions):
  - `logger` (Logger): Logger instance
  - `reporter` (Reporter): Error reporter service
  - `includeStackTrace` (boolean): Include stack in response
  - `defaultMessage` (string): Default error message

##### Methods

###### `middleware(): Function`
Returns Express error handler middleware.

###### `asyncWrapper(fn: Function): Function`
Wraps async function for error handling.

###### `handleUncaughtException(): void`
Sets up uncaught exception handler.

###### `handleUnhandledRejection(): void`
Sets up unhandled rejection handler.

###### `errorBoundary(fn: Function): Function`
Creates error boundary for async operations.

###### `formatError(error: AppError, format: string): any`
Formats error for different outputs.

**Format options:** `'json'`, `'http'`, `'sentry'`, `'text'`, `'user'`

---

### ErrorAggregator

**Path:** `shared/lib/utils/app-error.js`

#### Class: `ErrorAggregator`

Collects and analyzes errors for monitoring.

##### Constructor

```typescript
new ErrorAggregator(options?: AggregatorOptions)
```

**Parameters:**
- `options` (AggregatorOptions):
  - `maxErrors` (number): Maximum errors to store (default: 1000)
  - `aggregationWindow` (number): Time window in ms (default: 60000)

##### Methods

###### `add(error: AppError): void`
Adds error to aggregator.

###### `getRecent(limit?: number): AppError[]`
Gets recent errors.

###### `getByTimeWindow(windowMs: number): AppError[]`
Gets errors within time window.

###### `getPatterns(minOccurrences?: number): Pattern[]`
Gets error patterns.

###### `getStats(): AggregatorStats`
Gets aggregator statistics.

**Returns:**
```typescript
{
  total: number,
  byCategory: object,
  bySeverity: object,
  byCode: object,
  byService: object,
  recentCount: number,
  errorRate: number,
  topErrors: array,
  criticalErrors: number
}
```

###### `clear(): void`
Clears all aggregated data.

###### `export(): object`
Exports aggregated data for analysis.

---

### Logger

**Path:** `shared/lib/utils/logger.js`

#### Class: `Logger`

Comprehensive logging system with multiple transports.

##### Constructor

```typescript
new Logger(options?: LoggerOptions)
```

**Parameters:**
- `options` (LoggerOptions):
  - `serviceName` (string): Service identifier
  - `logLevel` (string): Minimum log level
  - `logDir` (string): Log directory path
  - `enableConsole` (boolean): Enable console output
  - `enableFile` (boolean): Enable file logging
  - `enableRotation` (boolean): Enable log rotation
  - `enableJson` (boolean): JSON format output
  - `enableTimestamp` (boolean): Include timestamps
  - `enableErrors` (boolean): Include error details
  - `enableProfiling` (boolean): Enable profiling
  - `enableMetrics` (boolean): Track metrics
  - `enableAnalytics` (boolean): Enable analytics
  - `enableFiltering` (boolean): Enable log filtering
  - `context` (object): Default context
  - `filter` (object): Filter configuration
  - `structuredFields` (object): Structured logging fields
  - `bufferSize` (number): Log buffer size
  - `flushInterval` (number): Buffer flush interval

##### Methods

###### `fatal(message: string, meta?: object): void`
Logs fatal error.

###### `error(message: string, meta?: object): void`
Logs error.

###### `warn(message: string, meta?: object): void`
Logs warning.

###### `info(message: string, meta?: object): void`
Logs info message.

###### `debug(message: string, meta?: object): void`
Logs debug message.

###### `trace(message: string, meta?: object): void`
Logs trace message.

###### `logStructured(level: string, message: string, data?: object): void`
Logs with structured data.

###### `audit(event: AuditEvent): void`
Logs audit event.

**AuditEvent:**
```typescript
{
  actor: string,
  action: string,
  resource: string,
  result?: string,
  details?: object,
  ip?: string,
  userAgent?: string
}
```

###### `security(event: SecurityEvent): void`
Logs security event.

**SecurityEvent:**
```typescript
{
  severity?: string,
  category: string,
  description: string,
  source?: string,
  target?: string,
  action?: string,
  outcome?: string
}
```

###### `business(event: BusinessEvent): void`
Logs business event.

**BusinessEvent:**
```typescript
{
  type: string,
  userId?: string,
  organizationId?: string,
  action: string,
  entity?: string,
  entityId?: string,
  metadata?: object
}
```

###### `child(context: object): Logger`
Creates child logger with additional context.

###### `startProfile(id: string): void`
Starts profiling session.

###### `endProfile(id: string, meta?: object): void`
Ends profiling session.

###### `startTimer(label: string): Function`
Starts performance timer.

**Returns:** Function to end timer

###### `logRequest(req: Request, res: Response): void`
Logs HTTP request.

###### `middleware(): Function`
Returns Express logging middleware.

###### `stream(options?: object): object`
Creates writable stream for logging.

###### `addTransport(transport: CustomTransport): void`
Adds custom transport.

###### `removeTransport(name: string): void`
Removes custom transport.

###### `setFilter(filterOptions: object): void`
Sets log filter.

###### `clearFilter(): void`
Clears log filter.

###### `addStructuredField(key: string, value: any): void`
Adds structured field.

###### `removeStructuredField(key: string): void`
Removes structured field.

###### `getMetrics(): LoggerMetrics`
Gets logger metrics.

###### `clearMetrics(): void`
Clears metrics.

###### `getAnalyticsReport(): AnalyticsReport`
Gets analytics report.

###### `searchLogs(criteria: SearchCriteria): Promise<LogEntry[]>`
Searches logs.

**SearchCriteria:**
```typescript
{
  startDate?: Date,
  endDate?: Date,
  level?: string,
  pattern?: string,
  limit?: number
}
```

###### `exportLogs(options?: ExportOptions): Promise<string>`
Exports logs to file.

###### `rotateLogs(): Promise<void>`
Manually rotates logs.

###### `getStatistics(): LogStatistics`
Gets log statistics.

###### `createContextualLogger(context: object): ContextualLogger`
Creates contextual logger.

###### `logWithTags(level: string, message: string, tags: string[], meta?: object): void`
Logs with tags.

###### `scope(scope: string): Logger`
Creates scoped logger.

###### `logMethod(methodName: string, fn: Function, meta?: object): Promise<any>`
Logs method execution.

###### `flush(): Promise<void>`
Flushes log buffer.

###### `close(): Promise<void>`
Closes logger and cleanup.

##### Static Methods

###### `Logger.configure(options: LoggerOptions): Logger`
Configures global logger.

###### `Logger.getInstance(): Logger`
Gets global logger instance.

###### `Logger.createChild(context: object): Logger`
Creates child logger from global instance.

---

### AsyncHandler

**Path:** `shared/lib/utils/async-handler.js`

#### Class: `AsyncHandler extends EventEmitter`

Comprehensive async operations handler.

##### Constructor

```typescript
new AsyncHandler(config?: AsyncHandlerConfig)
```

**Parameters:**
- `config` (AsyncHandlerConfig):
  - `defaultTimeout` (number): Default timeout in ms
  - `maxRetries` (number): Maximum retry attempts
  - `retryDelay` (number): Base retry delay
  - `exponentialBackoff` (boolean): Use exponential backoff
  - `circuitBreakerThreshold` (number): Circuit breaker threshold
  - `circuitBreakerTimeout` (number): Circuit breaker timeout
  - `enableMetrics` (boolean): Enable metrics tracking
  - `enableLogging` (boolean): Enable logging
  - `enableCaching` (boolean): Enable caching
  - `cacheTimeout` (number): Cache timeout
  - `batchSize` (number): Default batch size
  - `concurrencyLimit` (number): Concurrency limit

##### Methods

###### `wrap(fn: Function, options?: WrapOptions): Function`
Wraps async route handler.

**WrapOptions:**
```typescript
{
  timeout?: number,
  enableLogging?: boolean,
  context?: string
}
```

###### `wrapWithLogging(fn: Function, context?: string): Function`
Wraps with logging enhancement.

###### `withTimeout(fn: Function, timeout?: number, timeoutMessage?: string): Promise<any>`
Executes with timeout.

###### `withRetry(fn: Function, options?: RetryOptions): Promise<any>`
Executes with retry logic.

**RetryOptions:**
```typescript
{
  maxRetries?: number,
  retryDelay?: number,
  exponentialBackoff?: boolean,
  onRetry?: Function,
  retryCondition?: Function,
  abortSignal?: AbortSignal
}
```

###### `parallel(operations: Function[], options?: ParallelOptions): Promise<any[]>`
Executes operations in parallel.

**ParallelOptions:**
```typescript
{
  stopOnError?: boolean,
  concurrency?: number,
  timeout?: number
}
```

###### `series(operations: Function[], options?: SeriesOptions): Promise<any[]>`
Executes operations in series.

**SeriesOptions:**
```typescript
{
  stopOnError?: boolean,
  delay?: number,
  accumulator?: any
}
```

###### `createCircuitBreaker(fn: Function, options?: CircuitBreakerOptions): Function`
Creates circuit breaker.

**CircuitBreakerOptions:**
```typescript
{
  threshold?: number,
  timeout?: number,
  fallback?: Function,
  name?: string
}
```

###### `batch(items: any[], processor: Function, batchSize?: number): Promise<any[]>`
Processes items in batches.

###### `debounce(fn: Function, delay?: number): Function`
Creates debounced function.

###### `throttle(fn: Function, limit?: number): Function`
Creates throttled function.

###### `memoize(fn: Function, options?: MemoizeOptions): Function`
Creates memoized function.

**MemoizeOptions:**
```typescript
{
  keyResolver?: Function,
  ttl?: number,
  maxSize?: number
}
```

###### `createQueue(concurrency?: number): Queue`
Creates async queue.

**Queue Methods:**
```typescript
{
  add(fn: Function, priority?: number): Promise<any>,
  size(): number,
  running(): number,
  clear(): void,
  pause(): void,
  resume(): void,
  isPaused(): boolean
}
```

###### `createRateLimiter(options?: RateLimiterOptions): Function`
Creates rate limiter.

**RateLimiterOptions:**
```typescript
{
  maxRequests?: number,
  windowMs?: number,
  keyGenerator?: Function
}
```

###### `middleware(middleware: Function): Function`
Creates async middleware wrapper.

###### `validate(validator: Function): Function`
Handles async validation.

###### `pipe(...fns: Function[]): Function`
Creates async pipe.

###### `compose(...fns: Function[]): Function`
Creates async compose.

###### `withFallback(primary: Function, fallback: Function): Promise<any>`
Executes with fallback.

###### `withCache(key: string, fn: Function, options?: CacheOptions): Promise<any>`
Executes with cache.

###### `withTransaction(fn: Function, options?: TransactionOptions): Promise<any>`
Executes with transaction wrapper.

###### `processAsyncIterator(iterable: AsyncIterable, processor: Function): AsyncGenerator`
Processes async iterator.

###### `withProgress(items: any[], processor: Function, onProgress?: Function): Promise<any[]>`
Executes with progress tracking.

###### `createMutex(name?: string): Mutex`
Creates mutex for synchronization.

**Mutex Methods:**
```typescript
{
  acquire(): Promise<void>,
  release(): void,
  withLock(fn: Function): Promise<any>,
  isLocked(): boolean,
  queueLength(): number
}
```

###### `createSemaphore(permits?: number): Semaphore`
Creates semaphore.

**Semaphore Methods:**
```typescript
{
  acquire(count?: number): Promise<void>,
  release(count?: number): void,
  withPermits(count: number, fn: Function): Promise<any>,
  availablePermits(): number,
  queueLength(): number
}
```

###### `getMetrics(): AsyncHandlerMetrics`
Gets handler metrics.

###### `resetMetrics(): void`
Resets metrics.

###### `clearCache(): void`
Clears cache.

##### Static Methods

###### `AsyncHandler.getInstance(config?: AsyncHandlerConfig): AsyncHandler`
Gets singleton instance.

##### Events

- `success`: Emitted on successful operation
- `error`: Emitted on error
- `retry`: Emitted on retry attempt
- `retrySuccess`: Emitted on successful retry
- `retryFailed`: Emitted when all retries fail
- `circuitOpen`: Emitted when circuit opens
- `circuitHalfOpen`: Emitted when circuit half-opens
- `circuitClosed`: Emitted when circuit closes
- `batchStart`: Emitted when batch starts
- `batchComplete`: Emitted when batch completes
- `transactionStart`: Emitted on transaction start
- `transactionCommit`: Emitted on transaction commit
- `transactionRollback`: Emitted on transaction rollback
- `progress`: Emitted on progress update
- `metrics`: Emitted periodically with metrics

---

### ResponseFormatter

**Path:** `shared/lib/utils/response-formatter.js`

#### Class: `ResponseFormatter`

Standardizes API response formats.

##### Static Methods

###### `ResponseFormatter.success(data: any, message?: string, meta?: object): SuccessResponse`
Formats successful response.

**Returns:**
```typescript
{
  success: true,
  message: string,
  data: any,
  timestamp: string,
  meta?: object,
  requestId?: string
}
```

###### `ResponseFormatter.error(message: string, statusCode?: number, errorCode?: string, details?: object): ErrorResponse`
Formats error response.

**Returns:**
```typescript
{
  success: false,
  error: {
    message: string,
    code: string,
    statusCode: number,
    timestamp: string,
    details?: object
  },
  requestId?: string
}
```

###### `ResponseFormatter.paginated(data: any[], pagination: PaginationInfo, message?: string): PaginatedResponse`
Formats paginated response.

**PaginationInfo:**
```typescript
{
  page: number,
  limit: number,
  total: number
}
```

**Returns:**
```typescript
{
  success: true,
  message: string,
  data: any[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    hasNext: boolean,
    hasPrev: boolean,
    nextPage: number | null,
    prevPage: number | null
  },
  timestamp: string
}
```

###### `ResponseFormatter.validationError(errors: any[], message?: string): ValidationErrorResponse`
Formats validation error response.

###### `ResponseFormatter.created(data: any, message?: string, location?: string): CreatedResponse`
Formats resource created response.

###### `ResponseFormatter.updated(data: any, message?: string): UpdatedResponse`
Formats resource updated response.

###### `ResponseFormatter.deleted(message?: string, data?: any): DeletedResponse`
Formats resource deleted response.

###### `ResponseFormatter.noContent(): NoContentResponse`
Formats no content response.

###### `ResponseFormatter.notFound(resource?: string, identifier?: string): NotFoundResponse`
Formats not found response.

###### `ResponseFormatter.unauthorized(message?: string, errorCode?: string): UnauthorizedResponse`
Formats unauthorized response.

###### `ResponseFormatter.forbidden(message?: string, errorCode?: string): ForbiddenResponse`
Formats forbidden response.

###### `ResponseFormatter.conflict(message: string, errorCode?: string, details?: object): ConflictResponse`
Formats conflict response.

###### `ResponseFormatter.tooManyRequests(retryAfter?: number, message?: string): RateLimitResponse`
Formats rate limit response.

###### `ResponseFormatter.serviceUnavailable(message?: string, retryAfter?: number): ServiceUnavailableResponse`
Formats service unavailable response.

###### `ResponseFormatter.batch(results: any[], message?: string): BatchResponse`
Formats batch operation response.

###### `ResponseFormatter.fileUploaded(fileInfo: FileInfo, message?: string): FileUploadResponse`
Formats file upload response.

###### `ResponseFormatter.authenticated(authData: AuthData, message?: string): AuthResponse`
Formats authentication response.

###### `ResponseFormatter.loggedOut(message?: string): LogoutResponse`
Formats logout response.

###### `ResponseFormatter.healthCheck(health: HealthInfo, message?: string): HealthResponse`
Formats health check response.

###### `ResponseFormatter.asyncOperation(operationId: string, status?: string, message?: string): AsyncOperationResponse`
Formats async operation response.

###### `ResponseFormatter.webhook(received?: boolean, message?: string): WebhookResponse`
Formats webhook response.

###### `ResponseFormatter.send(res: Response, response: any, statusCode?: number): void`
Sends formatted response.

---

## Validators

### CommonValidators

**Path:** `shared/lib/utils/validators/common-validators.js`

#### Class: `CommonValidators`

Common validation rules for general use.

##### Static Methods

###### `CommonValidators.mongoId(field: string, location?: string): ValidationChain`
Validates MongoDB ObjectId.

**Parameters:**
- `field` (string): Field name
- `location` (string): Field location ('param', 'body', 'query')

###### `CommonValidators.email(field?: string, options?: EmailOptions): ValidationChain`
Validates email address.

**EmailOptions:**
```typescript
{
  required?: boolean,
  normalize?: boolean
}
```

###### `CommonValidators.phoneNumber(field?: string, options?: PhoneOptions): ValidationChain`
Validates phone number.

**PhoneOptions:**
```typescript
{
  required?: boolean,
  locale?: string
}
```

###### `CommonValidators.url(field?: string, options?: URLOptions): ValidationChain`
Validates URL.

**URLOptions:**
```typescript
{
  required?: boolean,
  protocols?: string[],
  requireProtocol?: boolean
}
```

###### `CommonValidators.date(field: string, options?: DateOptions): ValidationChain`
Validates date.

**DateOptions:**
```typescript
{
  required?: boolean,
  format?: string,
  before?: Date,
  after?: Date
}
```

###### `CommonValidators.stringLength(field: string, options?: StringLengthOptions): ValidationChain`
Validates string length.

**StringLengthOptions:**
```typescript
{
  min?: number,
  max?: number,
  required?: boolean,
  trim?: boolean
}
```

###### `CommonValidators.numberRange(field: string, options?: NumberRangeOptions): ValidationChain`
Validates number range.

**NumberRangeOptions:**
```typescript
{
  min?: number,
  max?: number,
  required?: boolean,
  integer?: boolean
}
```

###### `CommonValidators.boolean(field: string, options?: BooleanOptions): ValidationChain`
Validates boolean.

###### `CommonValidators.array(field: string, options?: ArrayOptions): ValidationChain`
Validates array.

**ArrayOptions:**
```typescript
{
  required?: boolean,
  minLength?: number,
  maxLength?: number,
  unique?: boolean
}
```

###### `CommonValidators.enum(field: string, values: any[], options?: EnumOptions): ValidationChain`
Validates enum values.

###### `CommonValidators.json(field: string, options?: JSONOptions): ValidationChain`
Validates JSON.

###### `CommonValidators.uuid(field: string, options?: UUIDOptions): ValidationChain`
Validates UUID.

**UUIDOptions:**
```typescript
{
  required?: boolean,
  version?: number
}
```

###### `CommonValidators.ipAddress(field: string, options?: IPOptions): ValidationChain`
Validates IP address.

**IPOptions:**
```typescript
{
  required?: boolean,
  version?: number
}
```

###### `CommonValidators.creditCard(field?: string, options?: CreditCardOptions): ValidationChain`
Validates credit card number.

###### `CommonValidators.postalCode(field?: string, options?: PostalCodeOptions): ValidationChain`
Validates postal code.

**PostalCodeOptions:**
```typescript
{
  required?: boolean,
  locale?: string
}
```

###### `CommonValidators.pagination(): ValidationChain[]`
Validates pagination parameters.

###### `CommonValidators.fileUpload(field?: string, options?: FileUploadOptions): Function`
Validates file upload.

**FileUploadOptions:**
```typescript
{
  required?: boolean,
  maxSize?: number,
  allowedTypes?: string[]
}
```

###### `CommonValidators.checkValidation(): Function`
Checks validation results middleware.

###### `CommonValidators.sanitize(field: string): ValidationChain`
Sanitizes input.

---

### AuthValidators

**Path:** `shared/lib/utils/validators/auth-validators.js`

#### Class: `AuthValidators`

Authentication and authorization validation rules.

##### Static Methods

###### `AuthValidators.login(): ValidationChain[]`
Validates login credentials.

###### `AuthValidators.register(): ValidationChain[]`
Validates registration data.

###### `AuthValidators.forgotPassword(): ValidationChain[]`
Validates password reset request.

###### `AuthValidators.resetPassword(): ValidationChain[]`
Validates password reset.

###### `AuthValidators.changePassword(): ValidationChain[]`
Validates password change.

###### `AuthValidators.jwtToken(): ValidationChain[]`
Validates JWT token in header.

###### `AuthValidators.apiKey(): ValidationChain[]`
Validates API key.

###### `AuthValidators.refreshToken(): ValidationChain[]`
Validates refresh token.

###### `AuthValidators.twoFactorAuth(): ValidationChain[]`
Validates two-factor authentication.

###### `AuthValidators.oauthCallback(): ValidationChain[]`
Validates OAuth callback.

###### `AuthValidators.session(): Function`
Validates session middleware.

###### `AuthValidators.permissions(requiredPermissions: string[]): Function`
Validates permissions middleware.

###### `AuthValidators.roles(requiredRoles: string[]): Function`
Validates roles middleware.

###### `AuthValidators.verifyEmail(): ValidationChain[]`
Validates email verification.

###### `AuthValidators.activateAccount(): ValidationChain[]`
Validates account activation.

###### `AuthValidators.registerPasskey(): ValidationChain[]`
Validates passkey registration.

###### `AuthValidators.authenticatePasskey(): ValidationChain[]`
Validates passkey authentication.

###### `AuthValidators.logout(): ValidationChain[]`
Validates logout.

###### `AuthValidators.isAuthenticated(): Function`
Checks if user is authenticated middleware.

###### `AuthValidators.isOwner(resourceOwnerGetter: Function): Function`
Checks if user owns resource middleware.

###### `AuthValidators.csrfToken(): ValidationChain[]`
Validates CSRF token.

---

### UserValidators

**Path:** `shared/lib/utils/validators/user-validators.js`

#### Class: `UserValidators`

User-specific validation rules.

##### Static Methods

###### `UserValidators.createUser(): ValidationChain[]`
Validates user creation.

###### `UserValidators.updateUser(): ValidationChain[]`
Validates user update.

###### `UserValidators.updateProfile(): ValidationChain[]`
Validates profile update.

###### `UserValidators.deleteUser(): ValidationChain[]`
Validates user deletion.

###### `UserValidators.searchUsers(): ValidationChain[]`
Validates user search.

###### `UserValidators.updateUserStatus(): ValidationChain[]`
Validates user status update.

###### `UserValidators.updatePreferences(): ValidationChain[]`
Validates preferences update.

###### `UserValidators.uploadAvatar(): Function`
Validates avatar upload middleware.

###### `UserValidators.validateAddress(): ValidationChain[]`
Validates user address.

###### `UserValidators.updatePermissions(): ValidationChain[]`
Validates permissions update.

###### `UserValidators.assignRole(): ValidationChain[]`
Validates role assignment.

###### `UserValidators.bulkOperation(): ValidationChain[]`
Validates bulk user operations.

###### `UserValidators.verifyUser(): ValidationChain[]`
Validates user verification.

###### `UserValidators.getUserActivity(): ValidationChain[]`
Validates user activity query.

---

### OrganizationValidators

**Path:** `shared/lib/utils/validators/organization-validators.js`

#### Class: `OrganizationValidators`

Organization-specific validation rules.

##### Static Methods

###### `OrganizationValidators.createOrganization(): ValidationChain[]`
Validates organization creation.

###### `OrganizationValidators.updateOrganization(): ValidationChain[]`
Validates organization update.

###### `OrganizationValidators.addMember(): ValidationChain[]`
Validates member addition.

###### `OrganizationValidators.updateSubscription(): ValidationChain[]`
Validates subscription plan.

###### `OrganizationValidators.updateSettings(): ValidationChain[]`
Validates organization settings.

###### `OrganizationValidators.createDepartment(): ValidationChain[]`
Validates department creation.

###### `OrganizationValidators.createTeam(): ValidationChain[]`
Validates team creation.

###### `OrganizationValidators.createProject(): ValidationChain[]`
Validates project creation.

###### `OrganizationValidators.allocateBudget(): ValidationChain[]`
Validates budget allocation.

###### `OrganizationValidators.updateCompliance(): ValidationChain[]`
Validates compliance updates.

###### `OrganizationValidators.updateMetrics(): ValidationChain[]`
Validates metrics updates.

###### `OrganizationValidators.addIntegration(): ValidationChain[]`
Validates integration addition.

###### `OrganizationValidators.addDomain(): ValidationChain[]`
Validates domain addition.

###### `OrganizationValidators.updateNotificationSettings(): ValidationChain[]`
Validates notification settings.

###### `OrganizationValidators.updateSecuritySettings(): ValidationChain[]`
Validates security settings.

###### `OrganizationValidators.updateApiSettings(): ValidationChain[]`
Validates API settings.

###### `OrganizationValidators.exportData(): ValidationChain[]`
Validates data export request.

###### `OrganizationValidators.importData(): ValidationChain[]`
Validates data import request.

###### `OrganizationValidators.checkBusinessRules(): Function`
Business rules validation middleware.

---

### CustomValidators

**Path:** `shared/lib/utils/validators/custom-validators.js`

#### Class: `CustomValidators`

Custom validation rules for specialized use cases.

##### Static Methods

###### `CustomValidators.businessRule(validator: Function, errorMessage?: string): Function`
Validates business rules.

###### `CustomValidators.conditional(field: string, condition: Function, validator: Function): ValidationChain`
Conditional validation.

###### `CustomValidators.dependencies(dependencies: object): ValidationChain[]`
Validates field dependencies.

###### `CustomValidators.cronExpression(field?: string): ValidationChain`
Validates cron expression.

###### `CustomValidators.coordinates(latField?: string, lngField?: string): ValidationChain[]`
Validates geographic coordinates.

###### `CustomValidators.colorCode(field?: string): ValidationChain`
Validates color code.

###### `CustomValidators.semver(field?: string): ValidationChain`
Validates semantic version.

###### `CustomValidators.iban(field?: string): ValidationChain`
Validates IBAN.

###### `CustomValidators.bic(field?: string): ValidationChain`
Validates BIC/SWIFT code.

###### `CustomValidators.taxId(field?: string, locale?: string): ValidationChain`
Validates tax ID.

###### `CustomValidators.fileExtension(field: string, extensions: string[]): Function`
Validates file extension.

###### `CustomValidators.range(startField: string, endField: string, type?: string): ValidationChain`
Validates data range consistency.

###### `CustomValidators.complexPassword(field?: string, requirements?: PasswordRequirements): ValidationChain`
Validates complex password requirements.

**PasswordRequirements:**
```typescript
{
  minLength?: number,
  requireUppercase?: boolean,
  requireLowercase?: boolean,
  requireNumbers?: boolean,
  requireSpecialChars?: boolean,
  prohibitCommon?: boolean
}
```

###### `CustomValidators.databaseQuery(): ValidationChain[]`
Validates database query.

###### `CustomValidators.async(field: string, validator: Function, errorMessage?: string): ValidationChain`
Creates custom async validator.

---

## Helpers

### CryptoHelper

**Path:** `shared/lib/utils/helpers/crypto-helper.js`

#### Class: `CryptoHelper`

Cryptographic operations and security utilities.

##### Static Methods

###### `CryptoHelper.hashPassword(password: string): Promise<string>`
Hashes password using bcrypt.

###### `CryptoHelper.comparePassword(password: string, hash: string): Promise<boolean>`
Compares password with hash.

###### `CryptoHelper.generateToken(length?: number): string`
Generates secure random token.

###### `CryptoHelper.generateUUID(): string`
Generates UUID v4.

###### `CryptoHelper.generateOTP(length?: number): string`
Generates numeric OTP.

###### `CryptoHelper.encrypt(data: string | Buffer, key: string | Buffer): EncryptedData`
Encrypts data using AES-256-GCM.

**Returns:**
```typescript
{
  data: string,
  iv: string,
  tag: string
}
```

###### `CryptoHelper.decrypt(encryptedData: EncryptedData, key: string | Buffer): Buffer`
Decrypts data.

###### `CryptoHelper.generateJWT(payload: object, secret: string, options?: JWTOptions): string`
Generates JWT token.

**JWTOptions:**
```typescript
{
  expiresIn?: string,
  algorithm?: string,
  issuer?: string,
  audience?: string
}
```

###### `CryptoHelper.verifyJWT(token: string, secret: string, options?: JWTVerifyOptions): object`
Verifies JWT token.

###### `CryptoHelper.sign(data: string, privateKey: string): string`
Creates digital signature.

###### `CryptoHelper.verify(data: string, signature: string, publicKey: string): boolean`
Verifies digital signature.

###### `CryptoHelper.hash(data: string, algorithm?: string): string`
Creates hash of data.

###### `CryptoHelper.hmac(data: string, secret: string, algorithm?: string): string`
Creates HMAC.

###### `CryptoHelper.generateKeyPair(): KeyPair`
Generates RSA key pair.

**Returns:**
```typescript
{
  publicKey: string,
  privateKey: string
}
```

###### `CryptoHelper.deriveKey(password: string, salt: string, iterations?: number, keyLength?: number): Buffer`
Derives key from password.

###### `CryptoHelper.timingSafeEqual(a: string, b: string): boolean`
Timing-safe comparison.

---

### StringHelper

**Path:** `shared/lib/utils/helpers/string-helper.js`

#### Class: `StringHelper`

String manipulation and text processing.

##### Static Methods

###### `StringHelper.toCamelCase(str: string): string`
Converts to camelCase.

###### `StringHelper.toPascalCase(str: string): string`
Converts to PascalCase.

###### `StringHelper.toSnakeCase(str: string): string`
Converts to snake_case.

###### `StringHelper.toKebabCase(str: string): string`
Converts to kebab-case.

###### `StringHelper.toTitleCase(str: string): string`
Converts to Title Case.

###### `StringHelper.toSentenceCase(str: string): string`
Converts to Sentence case.

###### `StringHelper.capitalize(str: string): string`
Capitalizes first letter.

###### `StringHelper.truncate(str: string, length: number, suffix?: string): string`
Truncates string.

###### `StringHelper.slugify(str: string, options?: SlugifyOptions): string`
Creates URL-friendly slug.

**SlugifyOptions:**
```typescript
{
  separator?: string,
  lowercase?: boolean,
  strict?: boolean
}
```

###### `StringHelper.excerpt(str: string, length?: number, suffix?: string): string`
Creates excerpt.

###### `StringHelper.removeHtml(str: string): string`
Removes HTML tags.

###### `StringHelper.escapeHtml(str: string): string`
Escapes HTML entities.

###### `StringHelper.unescapeHtml(str: string): string`
Unescapes HTML entities.

###### `StringHelper.isEmail(str: string): boolean`
Checks if valid email.

###### `StringHelper.isURL(str: string): boolean`
Checks if valid URL.

###### `StringHelper.isUUID(str: string, version?: number): boolean`
Checks if valid UUID.

###### `StringHelper.isJSON(str: string): boolean`
Checks if valid JSON.

###### `StringHelper.maskString(str: string, showFirst?: number, showLast?: number, maskChar?: string): string`
Masks sensitive string.

###### `StringHelper.highlight(text: string, search: string, before?: string, after?: string): string`
Highlights search term.

###### `StringHelper.countWords(str: string): number`
Counts words.

###### `StringHelper.calculateReadingTime(text: string, wordsPerMinute?: number): number`
Calculates reading time.

###### `StringHelper.extractEmails(text: string): string[]`
Extracts email addresses.

###### `StringHelper.extractURLs(text: string): string[]`
Extracts URLs.

###### `StringHelper.padLeft(str: string, length: number, char?: string): string`
Pads string left.

###### `StringHelper.padRight(str: string, length: number, char?: string): string`
Pads string right.

###### `StringHelper.reverse(str: string): string`
Reverses string.

###### `StringHelper.shuffle(str: string): string`
Shuffles string characters.

###### `StringHelper.levenshteinDistance(str1: string, str2: string): number`
Calculates Levenshtein distance.

###### `StringHelper.similarity(str1: string, str2: string): number`
Calculates similarity percentage.

---

### DateHelper

**Path:** `shared/lib/utils/helpers/date-helper.js`

#### Class: `DateHelper`

Date and time manipulation utilities.

##### Static Methods

###### `DateHelper.toISO(date: Date | string | number): string`
Formats date to ISO string.

###### `DateHelper.format(date: Date | string | number, format?: string): string`
Formats date with custom format.

###### `DateHelper.fromNow(date: Date | string | number): string`
Gets relative time from now.

###### `DateHelper.from(date: Date | string | number, referenceDate: Date | string | number): string`
Gets relative time from reference date.

###### `DateHelper.add(date: Date | string | number, amount: number, unit?: string): Date`
Adds time to date.

###### `DateHelper.subtract(date: Date | string | number, amount: number, unit?: string): Date`
Subtracts time from date.

###### `DateHelper.diff(date1: Date | string | number, date2: Date | string | number, unit?: string, precise?: boolean): number`
Gets difference between dates.

###### `DateHelper.isValid(date: any): boolean`
Checks if valid date.

###### `DateHelper.isBefore(date1: Date | string | number, date2: Date | string | number): boolean`
Checks if date1 is before date2.

###### `DateHelper.isAfter(date1: Date | string | number, date2: Date | string | number): boolean`
Checks if date1 is after date2.

###### `DateHelper.isBetween(date: Date | string | number, start: Date | string | number, end: Date | string | number, inclusivity?: string): boolean`
Checks if date is between two dates.

###### `DateHelper.isSame(date1: Date | string | number, date2: Date | string | number, unit?: string): boolean`
Checks if dates are same.

###### `DateHelper.startOf(date: Date | string | number, unit?: string): Date`
Gets start of period.

###### `DateHelper.endOf(date: Date | string | number, unit?: string): Date`
Gets end of period.

###### `DateHelper.toTimezone(date: Date | string | number, timezone: string): Date`
Converts to timezone.

###### `DateHelper.getCurrentTimezone(): string`
Gets current timezone.

###### `DateHelper.parse(dateString: string, format?: string | string[]): Date | null`
Parses date string.

###### `DateHelper.getAge(birthdate: Date | string | number): number`
Gets age from birthdate.

###### `DateHelper.businessDaysBetween(start: Date | string | number, end: Date | string | number): number`
Gets business days between dates.

###### `DateHelper.addBusinessDays(date: Date | string | number, days: number): Date`
Adds business days.

###### `DateHelper.getQuarter(date: Date | string | number): number`
Gets quarter of year.

###### `DateHelper.getWeekOfYear(date: Date | string | number): number`
Gets week of year.

###### `DateHelper.getDayOfYear(date: Date | string | number): number`
Gets day of year.

###### `DateHelper.isLeapYear(date: Date | string | number | number): boolean`
Checks if leap year.

###### `DateHelper.getDaysInMonth(date: Date | string | number): number`
Gets days in month.

###### `DateHelper.toUnix(date: Date | string | number): number`
Converts to Unix timestamp.

###### `DateHelper.fromUnix(timestamp: number): Date`
Creates date from Unix timestamp.

###### `DateHelper.toMillis(date: Date | string | number): number`
Gets milliseconds timestamp.

###### `DateHelper.range(start: Date | string | number, end: Date | string | number, step?: string): Date[]`
Creates date range.

###### `DateHelper.humanizeDuration(milliseconds: number): string`
Humanizes duration.

###### `DateHelper.isToday(date: Date | string | number): boolean`
Checks if today.

###### `DateHelper.isYesterday(date: Date | string | number): boolean`
Checks if yesterday.

###### `DateHelper.isTomorrow(date: Date | string | number): boolean`
Checks if tomorrow.

###### `DateHelper.isWeekend(date: Date | string | number): boolean`
Checks if weekend.

###### `DateHelper.isWeekday(date: Date | string | number): boolean`
Checks if weekday.

###### `DateHelper.getNextDay(dayOfWeek: number, fromDate?: Date | string | number): Date`
Gets next occurrence of day.

###### `DateHelper.formatDuration(milliseconds: number, options?: DurationOptions): string`
Formats duration.

**DurationOptions:**
```typescript
{
  units?: string[],
  separator?: string
}
```

###### `DateHelper.calendar(date: Date | string | number): string`
Gets calendar time.

###### `DateHelper.timeUntil(date: Date | string | number): string`
Gets time until future date.

###### `DateHelper.timeSince(date: Date | string | number): string`
Gets time since past date.

###### `DateHelper.isDST(date: Date | string | number): boolean`
Checks if in DST.

###### `DateHelper.getTimezoneOffset(date: Date | string | number, timezone?: string): number`
Gets timezone offset.

###### `DateHelper.clone(date: Date | string | number): Date`
Clones date.

###### `DateHelper.getTimezones(): string[]`
Gets all timezones.

###### `DateHelper.formatWithTimezone(date: Date | string | number, timezone: string, format?: string): string`
Formats with timezone.

---

### EmailHelper

**Path:** `shared/lib/utils/helpers/email-helper.js`

#### Class: `EmailHelper`

Email validation, formatting, and processing.

##### Static Methods

###### `EmailHelper.isValid(email: string, options?: EmailValidationOptions): boolean`
Validates email address.

**EmailValidationOptions:**
```typescript
{
  allowDisplayName?: boolean,
  requireDisplayName?: boolean,
  allowUtf8LocalPart?: boolean,
  requireTld?: boolean,
  ignoreMaxLength?: boolean,
  allowIpDomain?: boolean,
  domainSpecificValidation?: boolean,
  blacklistedChars?: string
}
```

###### `EmailHelper.normalize(email: string, options?: NormalizeOptions): string`
Normalizes email address.

**NormalizeOptions:**
```typescript
{
  allLowercase?: boolean,
  gmailRemoveDots?: boolean,
  gmailRemoveSubaddress?: boolean,
  gmailConvertGooglemaildotcom?: boolean,
  outlookdotcomRemoveSubaddress?: boolean,
  yahooRemoveSubaddress?: boolean,
  icloudRemoveSubaddress?: boolean
}
```

###### `EmailHelper.extractParts(email: string): EmailParts | null`
Extracts email parts.

**Returns:**
```typescript
{
  email: string,
  localPart: string,
  domain: string,
  domainName: string,
  tld: string,
  username: string,
  subaddress: string | null
}
```

###### `EmailHelper.isFreeProvider(email: string): boolean`
Checks if free email provider.

###### `EmailHelper.isDisposable(email: string): boolean`
Checks if disposable email.

###### `EmailHelper.isCorporate(email: string): boolean`
Checks if corporate email.

###### `EmailHelper.getGravatarUrl(email: string, options?: GravatarOptions): string`
Gets Gravatar URL.

**GravatarOptions:**
```typescript
{
  size?: number,
  default?: string,
  rating?: string,
  protocol?: string
}
```

###### `EmailHelper.mask(email: string, options?: MaskOptions): string`
Masks email for privacy.

**MaskOptions:**
```typescript
{
  showChars?: number,
  maskChar?: string,
  maskDomain?: boolean
}
```

###### `EmailHelper.generateVerificationToken(email: string, secret?: string): string`
Generates email verification token.

###### `EmailHelper.verifyToken(token: string, secret?: string, maxAge?: number): TokenVerificationResult`
Verifies email token.

**Returns:**
```typescript
{
  valid: boolean,
  reason?: string,
  email?: string
}
```

###### `EmailHelper.generateUnsubscribeToken(email: string, listId?: string): string`
Generates unsubscribe token.

###### `EmailHelper.parseWithDisplayName(emailString: string): ParsedEmail`
Parses email with display name.

**Returns:**
```typescript
{
  displayName: string | null,
  email: string
}
```

###### `EmailHelper.formatWithDisplayName(email: string, displayName: string): string`
Formats email with display name.

###### `EmailHelper.validateList(emails: string[] | string): ValidationResult`
Validates email list.

**Returns:**
```typescript
{
  valid: ParsedEmail[],
  invalid: string[],
  allValid: boolean,
  validCount: number,
  invalidCount: number
}
```

###### `EmailHelper.hasMXRecords(email: string): Promise<boolean>`
Checks MX records for domain.

###### `EmailHelper.suggestCorrections(email: string): string[]`
Suggests corrections for typos.

###### `EmailHelper.generateHash(email: string, salt?: string): string`
Generates email hash.

###### `EmailHelper.matchesPattern(email: string, pattern: string | RegExp): boolean`
Checks if email matches pattern.

###### `EmailHelper.getProviderInfo(email: string): ProviderInfo | null`
Gets email provider information.

**Returns:**
```typescript
{
  name: string,
  type: string,
  country: string
}
```

---

### CacheHelper

**Path:** `shared/lib/utils/helpers/cache-helper.js`

#### Class: `CacheHelper`

Caching and performance optimization.

##### Static Methods

###### `CacheHelper.initialize(): void`
Initializes cache helper.

###### `CacheHelper.setRedisClient(client: object): void`
Sets Redis client.

###### `CacheHelper.generateKey(namespace: string, identifier: string | object): string`
Generates cache key.

###### `CacheHelper.get(key: string, options?: GetOptions): Promise<any>`
Gets from cache.

**GetOptions:**
```typescript
{
  useRedis?: boolean,
  deserialize?: Function
}
```

###### `CacheHelper.set(key: string, value: any, options?: SetOptions): Promise<boolean>`
Sets cache value.

**SetOptions:**
```typescript
{
  ttl?: number,
  useRedis?: boolean,
  serialize?: Function
}
```

###### `CacheHelper.delete(key: string, options?: DeleteOptions): Promise<boolean>`
Deletes from cache.

###### `CacheHelper.clearPattern(pattern: string, options?: ClearOptions): Promise<number>`
Clears cache by pattern.

###### `CacheHelper.clearAll(): Promise<void>`
Clears all cache.

###### `CacheHelper.getOrLoad(key: string, loader: Function, options?: GetOrLoadOptions): Promise<any>`
Gets from cache or loads.

###### `CacheHelper.memoize(fn: Function, options?: MemoizeOptions): Function`
Memoizes function.

**MemoizeOptions:**
```typescript
{
  ttl?: number,
  keyGenerator?: Function,
  namespace?: string
}
```

###### `CacheHelper.mget(keys: string[], options?: MGetOptions): Promise<object>`
Batch get from cache.

###### `CacheHelper.mset(keyValues: object, options?: MSetOptions): Promise<boolean>`
Batch set cache values.

###### `CacheHelper.increment(key: string, amount?: number): Promise<number>`
Increments counter.

###### `CacheHelper.decrement(key: string, amount?: number): Promise<number>`
Decrements counter.

###### `CacheHelper.addToSet(key: string, member: any): Promise<boolean>`
Adds to set.

###### `CacheHelper.getStats(): CacheStats`
Gets cache statistics.

**Returns:**
```typescript
{
  hits: number,
  misses: number,
  sets: number,
  deletes: number,
  evictions: number,
  hitRate: number,
  memorySize: number,
  memoryMaxSize: number
}
```

###### `CacheHelper.warmUp(dataLoader: Function, keys: string[], options?: WarmUpOptions): Promise<number>`
Warms up cache.

###### `CacheHelper.createConfig(name: string, config: CacheConfig): void`
Creates cache configuration.

###### `CacheHelper.getWithConfig(configName: string, key: string): Promise<any>`
Gets with configuration.

###### `CacheHelper.setWithConfig(configName: string, key: string, value: any): Promise<boolean>`
Sets with configuration.

---

## Type Definitions

### Common Types

```typescript
interface ErrorOptions {
  id?: string;
  code?: string;
  statusCode?: number;
  category?: string;
  severity?: string;
  context?: object;
  metadata?: object;
  details?: any;
  errors?: array;
  isOperational?: boolean;
  isRetryable?: boolean;
  cause?: Error;
  correlationId?: string;
  requestId?: string;
  userId?: string;
  tenantId?: string;
}

interface LoggerOptions {
  serviceName?: string;
  logLevel?: string;
  logDir?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  enableRotation?: boolean;
  enableJson?: boolean;
  enableTimestamp?: boolean;
  enableErrors?: boolean;
  enableProfiling?: boolean;
  enableMetrics?: boolean;
  enableAnalytics?: boolean;
  enableFiltering?: boolean;
  context?: object;
  filter?: object;
  structuredFields?: object;
  bufferSize?: number;
  flushInterval?: number;
}

interface AsyncHandlerConfig {
  defaultTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
  enableMetrics?: boolean;
  enableLogging?: boolean;
  enableCaching?: boolean;
  cacheTimeout?: number;
  batchSize?: number;
  concurrencyLimit?: number;
}
```

---

## Error Codes Reference

### Authentication Errors (1000-1099)
- `AUTH_1000`: Authentication failed
- `AUTH_1001`: Invalid credentials
- `AUTH_1002`: Token expired
- `AUTH_1003`: Invalid token
- `AUTH_1004`: Unauthorized
- `AUTH_1005`: Session expired
- `AUTH_1006`: Invalid session
- `AUTH_1007`: MFA required
- `AUTH_1008`: MFA failed
- `AUTH_1009`: Account locked
- `AUTH_1010`: Account suspended
- `AUTH_1011`: Email not verified
- `AUTH_1012`: Password reset required

### Authorization Errors (1100-1199)
- `AUTHZ_1100`: Forbidden
- `AUTHZ_1101`: Insufficient permissions
- `AUTHZ_1102`: Role not allowed
- `AUTHZ_1103`: Resource access denied
- `AUTHZ_1104`: IP not whitelisted
- `AUTHZ_1105`: Tenant access denied
- `AUTHZ_1106`: Organization access denied

### Validation Errors (2000-2099)
- `VAL_2000`: Validation error
- `VAL_2001`: Invalid input
- `VAL_2002`: Missing required field
- `VAL_2003`: Invalid format
- `VAL_2004`: Value out of range
- `VAL_2005`: Duplicate value
- `VAL_2006`: Invalid reference
- `VAL_2007`: Invalid state transition
- `VAL_2008`: Invalid date range

### Resource Errors (3000-3099)
- `RES_3000`: Resource not found
- `RES_3001`: Resource already exists
- `RES_3002`: Resource conflict
- `RES_3003`: Resource locked
- `RES_3004`: Resource deleted
- `RES_3005`: Resource expired
- `RES_3006`: Resource limit exceeded
- `RES_3007`: Resource unavailable

### Database Errors (4000-4099)
- `DB_4000`: Database error
- `DB_4001`: Connection error
- `DB_4002`: Query error
- `DB_4003`: Transaction error
- `DB_4004`: Constraint violation
- `DB_4005`: Duplicate key
- `DB_4006`: Deadlock detected
- `DB_4007`: Timeout

### Business Logic Errors (5000-5099)
- `BIZ_5000`: Business rule violation
- `BIZ_5001`: Invalid operation
- `BIZ_5002`: Quota exceeded
- `BIZ_5003`: Rate limit exceeded
- `BIZ_5004`: Subscription required
- `BIZ_5005`: Payment required
- `BIZ_5006`: Billing error
- `BIZ_5007`: Contract violation
- `BIZ_5008`: SLA violation

### External Service Errors (6000-6099)
- `EXT_6000`: External service error
- `EXT_6001`: API error
- `EXT_6002`: Third-party error
- `EXT_6003`: Integration error
- `EXT_6004`: Webhook error
- `EXT_6005`: Payment gateway error
- `EXT_6006`: Email service error
- `EXT_6007`: SMS service error

### File Operation Errors (7000-7099)
- `FILE_7000`: File error
- `FILE_7001`: File not found
- `FILE_7002`: File too large
- `FILE_7003`: Invalid file type
- `FILE_7004`: File upload failed
- `FILE_7005`: File download failed
- `FILE_7006`: File processing failed

### Security Errors (8000-8099)
- `SEC_8000`: Security error
- `SEC_8001`: Invalid CSRF token
- `SEC_8002`: XSS detected
- `SEC_8003`: SQL injection detected
- `SEC_8004`: Suspicious activity
- `SEC_8005`: Encryption error
- `SEC_8006`: Decryption error
- `SEC_8007`: Signature verification failed

### System Errors (9000-9099)
- `SYS_9000`: Internal server error
- `SYS_9001`: Service unavailable
- `SYS_9002`: Operation timeout
- `SYS_9003`: Not implemented
- `SYS_9004`: Maintenance mode
- `SYS_9005`: Memory error
- `SYS_9006`: Configuration error
- `SYS_9007`: Initialization error

---

## HTTP Status Codes

### Success (2xx)
- `200 OK`: Request succeeded
- `201 Created`: Resource created
- `202 Accepted`: Request accepted for processing
- `204 No Content`: Request succeeded with no content

### Client Errors (4xx)
- `400 Bad Request`: Invalid request
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Access denied
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict
- `422 Unprocessable Entity`: Validation failed
- `429 Too Many Requests`: Rate limit exceeded

### Server Errors (5xx)
- `500 Internal Server Error`: Server error
- `502 Bad Gateway`: Invalid gateway response
- `503 Service Unavailable`: Service temporarily unavailable
- `504 Gateway Timeout`: Gateway timeout

---

## License

Proprietary and confidential.

## Support

For technical support, contact the development team.

---

*API Documentation Version 1.0.0 - Last Updated: 2024*
