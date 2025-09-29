/**
 * @fileoverview Comprehensive Application Error Class
 * @module shared/lib/utils/app-error
 * @description Production-ready error handling with error types, codes, and serialization
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Error severity levels
 */
const ErrorSeverity = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Error categories
 */
const ErrorCategory = {
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    VALIDATION: 'validation',
    BUSINESS_LOGIC: 'business_logic',
    DATABASE: 'database',
    EXTERNAL_SERVICE: 'external_service',
    NETWORK: 'network',
    SYSTEM: 'system',
    UNKNOWN: 'unknown'
};

/**
 * Common error codes
 */
const ErrorCode = {
    // Authentication & Authorization
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_INVALID: 'TOKEN_INVALID',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

    // Validation
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    INVALID_INPUT: 'INVALID_INPUT',
    MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
    INVALID_FORMAT: 'INVALID_FORMAT',

    // Resource
    NOT_FOUND: 'NOT_FOUND',
    ALREADY_EXISTS: 'ALREADY_EXISTS',
    CONFLICT: 'CONFLICT',
    RESOURCE_LOCKED: 'RESOURCE_LOCKED',

    // Rate Limiting & Quotas
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

    // Database
    DATABASE_ERROR: 'DATABASE_ERROR',
    CONNECTION_ERROR: 'CONNECTION_ERROR',
    QUERY_FAILED: 'QUERY_FAILED',
    TRANSACTION_FAILED: 'TRANSACTION_FAILED',

    // External Services
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
    TIMEOUT: 'TIMEOUT',
    NETWORK_ERROR: 'NETWORK_ERROR',

    // System
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
    INITIALIZATION_ERROR: 'INITIALIZATION_ERROR',

    // Business Logic
    BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
    INVALID_OPERATION: 'INVALID_OPERATION',
    PRECONDITION_FAILED: 'PRECONDITION_FAILED'
};

/**
 * HTTP status code mapping
 */
const StatusCodeMap = {
    [ErrorCode.UNAUTHORIZED]: 401,
    [ErrorCode.FORBIDDEN]: 403,
    [ErrorCode.TOKEN_EXPIRED]: 401,
    [ErrorCode.TOKEN_INVALID]: 401,
    [ErrorCode.SESSION_EXPIRED]: 401,
    [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
    [ErrorCode.VALIDATION_FAILED]: 422,
    [ErrorCode.INVALID_INPUT]: 400,
    [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
    [ErrorCode.INVALID_FORMAT]: 400,
    [ErrorCode.NOT_FOUND]: 404,
    [ErrorCode.ALREADY_EXISTS]: 409,
    [ErrorCode.CONFLICT]: 409,
    [ErrorCode.RESOURCE_LOCKED]: 423,
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
    [ErrorCode.QUOTA_EXCEEDED]: 429,
    [ErrorCode.DATABASE_ERROR]: 500,
    [ErrorCode.CONNECTION_ERROR]: 503,
    [ErrorCode.QUERY_FAILED]: 500,
    [ErrorCode.TRANSACTION_FAILED]: 500,
    [ErrorCode.SERVICE_UNAVAILABLE]: 503,
    [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
    [ErrorCode.TIMEOUT]: 504,
    [ErrorCode.NETWORK_ERROR]: 502,
    [ErrorCode.INTERNAL_ERROR]: 500,
    [ErrorCode.CONFIGURATION_ERROR]: 500,
    [ErrorCode.INITIALIZATION_ERROR]: 500,
    [ErrorCode.BUSINESS_RULE_VIOLATION]: 422,
    [ErrorCode.INVALID_OPERATION]: 400,
    [ErrorCode.PRECONDITION_FAILED]: 412
};

/**
 * Error recovery strategies
 */
const RecoveryStrategy = {
    RETRY: 'retry',
    RETRY_WITH_BACKOFF: 'retry_with_backoff',
    FAILOVER: 'failover',
    CIRCUIT_BREAK: 'circuit_break',
    COMPENSATE: 'compensate',
    IGNORE: 'ignore',
    ESCALATE: 'escalate',
    ROLLBACK: 'rollback'
};

/**
 * Error patterns for detection
 */
const ErrorPattern = {
    TRANSIENT: /timeout|temporarily|unavailable|too many requests/i,
    NETWORK: /network|connection|refused|ECONNREFUSED|ETIMEDOUT/i,
    PERMISSION: /permission|forbidden|unauthorized|access denied/i,
    RESOURCE: /not found|does not exist|404/i,
    VALIDATION: /invalid|validation|required|format/i,
    RATE_LIMIT: /rate limit|throttle|too many/i,
    MAINTENANCE: /maintenance|upgrading|scheduled/i
};

/**
 * Comprehensive Application Error Class
 * @class AppError
 * @extends Error
 */
class AppError extends Error {
    /**
     * Creates an instance of AppError
     * @param {string} message - Error message
     * @param {Object} options - Error options
     */
    constructor(message, options = {}) {
        super(message);

        // Basic properties
        this.name = this.constructor.name;
        this.id = options.id || uuidv4();
        this.timestamp = new Date().toISOString();

        // Error classification
        this.code = options.code || ErrorCode.INTERNAL_ERROR;
        this.statusCode = options.statusCode || StatusCodeMap[this.code] || 500;
        this.category = options.category || this._inferCategory();
        this.severity = options.severity || this._inferSeverity();

        // Context and metadata
        this.context = options.context || {};
        this.metadata = options.metadata || {};
        this.details = options.details || null;
        this.errors = options.errors || [];

        // Tracking
        this.service = options.service || process.env.SERVICE_NAME || 'unknown';
        this.environment = process.env.NODE_ENV || 'development';
        this.correlationId = options.correlationId || null;
        this.requestId = options.requestId || null;
        this.userId = options.userId || null;
        this.tenantId = options.tenantId || null;

        // Error chain
        this.cause = options.cause || null;
        this.originalError = options.originalError || null;

        // Flags
        this.isOperational = options.isOperational !== false;
        this.isRetryable = options.isRetryable || false;
        this.isLogged = false;
        this.isReported = false;

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);

        // Process cause if it's an error
        if (this.cause instanceof Error) {
            this.originalError = this.cause;
            this.cause = {
                message: this.cause.message,
                stack: this.cause.stack,
                name: this.cause.name
            };
        }
    }

    /**
     * Infer category from error code
     * @private
     */
    _inferCategory() {
        const code = this.code;

        if ([ErrorCode.UNAUTHORIZED, ErrorCode.TOKEN_EXPIRED, ErrorCode.TOKEN_INVALID].includes(code)) {
            return ErrorCategory.AUTHENTICATION;
        }

        if ([ErrorCode.FORBIDDEN, ErrorCode.INSUFFICIENT_PERMISSIONS].includes(code)) {
            return ErrorCategory.AUTHORIZATION;
        }

        if ([ErrorCode.VALIDATION_FAILED, ErrorCode.INVALID_INPUT, ErrorCode.MISSING_REQUIRED_FIELD].includes(code)) {
            return ErrorCategory.VALIDATION;
        }

        if ([ErrorCode.DATABASE_ERROR, ErrorCode.CONNECTION_ERROR, ErrorCode.QUERY_FAILED].includes(code)) {
            return ErrorCategory.DATABASE;
        }

        if ([ErrorCode.SERVICE_UNAVAILABLE, ErrorCode.EXTERNAL_SERVICE_ERROR, ErrorCode.TIMEOUT].includes(code)) {
            return ErrorCategory.EXTERNAL_SERVICE;
        }

        if ([ErrorCode.BUSINESS_RULE_VIOLATION, ErrorCode.INVALID_OPERATION].includes(code)) {
            return ErrorCategory.BUSINESS_LOGIC;
        }

        return ErrorCategory.SYSTEM;
    }

    /**
     * Infer severity from status code
     * @private
     */
    _inferSeverity() {
        if (this.statusCode >= 500) {
            return ErrorSeverity.HIGH;
        }
        if (this.statusCode >= 400 && this.statusCode < 500) {
            return ErrorSeverity.MEDIUM;
        }
        return ErrorSeverity.LOW;
    }

    /**
     * Analyze error pattern
     * @returns {Object} Error analysis
     */
    analyzePattern() {
        const analysis = {
            pattern: null,
            isTransient: false,
            isRetryable: false,
            suggestedStrategy: null,
            estimatedRecoveryTime: null
        };

        const messageAndCode = `${this.message} ${this.code}`.toLowerCase();

        // Check for patterns
        for (const [pattern, regex] of Object.entries(ErrorPattern)) {
            if (regex.test(messageAndCode)) {
                analysis.pattern = pattern;
                break;
            }
        }

        // Determine characteristics based on pattern
        switch (analysis.pattern) {
            case 'TRANSIENT':
            case 'NETWORK':
                analysis.isTransient = true;
                analysis.isRetryable = true;
                analysis.suggestedStrategy = RecoveryStrategy.RETRY_WITH_BACKOFF;
                analysis.estimatedRecoveryTime = 30000; // 30 seconds
                break;
            case 'RATE_LIMIT':
                analysis.isTransient = true;
                analysis.isRetryable = true;
                analysis.suggestedStrategy = RecoveryStrategy.RETRY_WITH_BACKOFF;
                analysis.estimatedRecoveryTime = 60000; // 1 minute
                break;
            case 'PERMISSION':
                analysis.isTransient = false;
                analysis.isRetryable = false;
                analysis.suggestedStrategy = RecoveryStrategy.ESCALATE;
                break;
            case 'RESOURCE':
                analysis.isTransient = false;
                analysis.isRetryable = false;
                analysis.suggestedStrategy = RecoveryStrategy.COMPENSATE;
                break;
            case 'VALIDATION':
                analysis.isTransient = false;
                analysis.isRetryable = false;
                analysis.suggestedStrategy = RecoveryStrategy.IGNORE;
                break;
            case 'MAINTENANCE':
                analysis.isTransient = true;
                analysis.isRetryable = true;
                analysis.suggestedStrategy = RecoveryStrategy.RETRY_WITH_BACKOFF;
                analysis.estimatedRecoveryTime = 300000; // 5 minutes
                break;
            default:
                analysis.suggestedStrategy = RecoveryStrategy.ESCALATE;
        }

        return analysis;
    }

    /**
     * Get recovery instructions
     * @returns {Object} Recovery instructions
     */
    getRecoveryInstructions() {
        const analysis = this.analyzePattern();
        const instructions = {
            strategy: analysis.suggestedStrategy,
            steps: [],
            metadata: {}
        };

        switch (analysis.suggestedStrategy) {
            case RecoveryStrategy.RETRY:
                instructions.steps = [
                    'Wait for a brief moment',
                    'Retry the operation',
                    'If fails, escalate to support'
                ];
                instructions.metadata = {
                    maxAttempts: 3,
                    delay: 1000
                };
                break;

            case RecoveryStrategy.RETRY_WITH_BACKOFF:
                instructions.steps = [
                    'Wait with exponential backoff',
                    'Retry with increasing delays',
                    'Monitor for recovery',
                    'Escalate if max attempts reached'
                ];
                instructions.metadata = {
                    maxAttempts: 5,
                    initialDelay: 1000,
                    maxDelay: 30000,
                    backoffFactor: 2
                };
                break;

            case RecoveryStrategy.FAILOVER:
                instructions.steps = [
                    'Switch to backup service',
                    'Redirect traffic',
                    'Monitor primary service',
                    'Restore when available'
                ];
                break;

            case RecoveryStrategy.CIRCUIT_BREAK:
                instructions.steps = [
                    'Open circuit breaker',
                    'Stop sending requests',
                    'Use fallback mechanism',
                    'Test with probe requests',
                    'Close circuit when healthy'
                ];
                instructions.metadata = {
                    openDuration: 60000,
                    halfOpenRequests: 3
                };
                break;

            case RecoveryStrategy.COMPENSATE:
                instructions.steps = [
                    'Identify compensation action',
                    'Execute compensation',
                    'Verify compensation success',
                    'Log compensation details'
                ];
                break;

            case RecoveryStrategy.ROLLBACK:
                instructions.steps = [
                    'Identify rollback point',
                    'Restore previous state',
                    'Verify rollback success',
                    'Notify stakeholders'
                ];
                break;

            case RecoveryStrategy.ESCALATE:
                instructions.steps = [
                    'Log detailed error information',
                    'Notify on-call engineer',
                    'Create incident ticket',
                    'Follow escalation matrix'
                ];
                break;
        }

        return instructions;
    }

    /**
     * Calculate error impact score
     * @returns {number} Impact score (0-100)
     */
    calculateImpactScore() {
        let score = 0;

        // Severity impact
        const severityScores = {
            [ErrorSeverity.CRITICAL]: 40,
            [ErrorSeverity.HIGH]: 30,
            [ErrorSeverity.MEDIUM]: 20,
            [ErrorSeverity.LOW]: 10
        };
        score += severityScores[this.severity] || 0;

        // Status code impact
        if (this.statusCode >= 500) score += 30;
        else if (this.statusCode >= 400) score += 15;

        // Category impact
        const categoryScores = {
            [ErrorCategory.DATABASE]: 20,
            [ErrorCategory.AUTHENTICATION]: 15,
            [ErrorCategory.EXTERNAL_SERVICE]: 15,
            [ErrorCategory.BUSINESS_LOGIC]: 10,
            [ErrorCategory.VALIDATION]: 5
        };
        score += categoryScores[this.category] || 5;

        // Operational impact
        if (!this.isOperational) score += 10;

        return Math.min(100, score);
    }

    /**
     * Get user-friendly message
     * @returns {string} User-friendly error message
     */
    getUserMessage() {
        const userMessages = {
            [ErrorCode.UNAUTHORIZED]: 'Please log in to continue',
            [ErrorCode.FORBIDDEN]: 'You don\'t have permission to access this resource',
            [ErrorCode.NOT_FOUND]: 'The requested resource could not be found',
            [ErrorCode.VALIDATION_FAILED]: 'Please check your input and try again',
            [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later',
            [ErrorCode.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable',
            [ErrorCode.INTERNAL_ERROR]: 'An unexpected error occurred. Please try again'
        };

        return userMessages[this.code] || this.message;
    }

    /**
     * Get developer message with debugging info
     * @returns {string} Developer-focused error message
     */
    getDeveloperMessage() {
        const parts = [
            `[${this.id}] ${this.name}: ${this.message}`,
            `Code: ${this.code}`,
            `Status: ${this.statusCode}`,
            `Category: ${this.category}`,
            `Severity: ${this.severity}`
        ];

        if (this.service) parts.push(`Service: ${this.service}`);
        if (this.requestId) parts.push(`Request: ${this.requestId}`);
        if (this.correlationId) parts.push(`Correlation: ${this.correlationId}`);

        return parts.join(' | ');
    }

    /**
     * Create error fingerprint for deduplication
     * @returns {string} Error fingerprint
     */
    createFingerprint() {
        const components = [
            this.code,
            this.statusCode,
            this.category,
            this.message.substring(0, 50)
        ];

        if (this.stack) {
            // Extract first meaningful stack frame
            const stackLines = this.stack.split('\n');
            const meaningfulFrame = stackLines.find(line =>
                line.includes('.js:') && !line.includes('node_modules')
            );
            if (meaningfulFrame) {
                components.push(meaningfulFrame.trim());
            }
        }

        return components.join('::');
    }

    /**
     * Get error metrics for monitoring
     * @returns {Object} Error metrics
     */
    getMetrics() {
        return {
            errorId: this.id,
            timestamp: this.timestamp,
            code: this.code,
            statusCode: this.statusCode,
            category: this.category,
            severity: this.severity,
            service: this.service,
            environment: this.environment,
            impactScore: this.calculateImpactScore(),
            isOperational: this.isOperational,
            isRetryable: this.isRetryable,
            fingerprint: this.createFingerprint()
        };
    }

    /**
     * Convert to Sentry format
     * @returns {Object} Sentry-compatible error object
     */
    toSentryFormat() {
        return {
            event_id: this.id,
            timestamp: this.timestamp,
            level: this.severity,
            platform: 'node',
            server_name: this.service,
            environment: this.environment,
            message: {
                message: this.message
            },
            exception: {
                values: [{
                    type: this.name,
                    value: this.message,
                    stacktrace: this.stack ? {
                        frames: this._parseStackFrames()
                    } : undefined
                }]
            },
            tags: {
                code: this.code,
                category: this.category,
                statusCode: this.statusCode
            },
            extra: {
                context: this.context,
                metadata: this.metadata,
                requestId: this.requestId,
                correlationId: this.correlationId
            },
            user: this.userId ? {
                id: this.userId
            } : undefined
        };
    }

    /**
     * Parse stack frames for error reporting
     * @private
     * @returns {Array} Parsed stack frames
     */
    _parseStackFrames() {
        if (!this.stack) return [];

        const frames = [];
        const lines = this.stack.split('\n').slice(1); // Skip first line (error message)

        for (const line of lines) {
            const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
            if (match) {
                frames.push({
                    function: match[1],
                    filename: match[2],
                    lineno: parseInt(match[3]),
                    colno: parseInt(match[4])
                });
            }
        }

        return frames.reverse(); // Sentry expects innermost frame first
    }

    /**
     * Clone error with modifications
     * @param {Object} modifications - Properties to modify
     * @returns {AppError} Cloned error
     */
    clone(modifications = {}) {
        return new AppError(modifications.message || this.message, {
            ...this.toJSON(true),
            ...modifications
        });
    }

    /**
     * Chain multiple errors
     * @param {Error} error - Error to chain
     * @returns {AppError} This error instance
     */
    chain(error) {
        if (!this.errors) this.errors = [];

        if (error instanceof AppError) {
            this.errors.push(error.toJSON());
        } else {
            this.errors.push({
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }

        return this;
    }

    /**
     * Static method to aggregate multiple errors
     * @static
     * @param {Array<Error>} errors - Array of errors
     * @param {string} message - Aggregate message
     * @param {Object} options - Additional options
     * @returns {AppError} Aggregated error
     */
    static aggregate(errors, message = 'Multiple errors occurred', options = {}) {
        const aggregated = new AppError(message, {
            ...options,
            code: ErrorCode.INTERNAL_ERROR,
            errors: errors.map(err => {
                if (err instanceof AppError) {
                    return err.toJSON();
                }
                return {
                    message: err.message,
                    stack: err.stack,
                    name: err.name
                };
            })
        });

        // Set severity to highest among errors
        let highestSeverity = ErrorSeverity.LOW;
        for (const error of errors) {
            if (error instanceof AppError) {
                const severityOrder = {
                    [ErrorSeverity.CRITICAL]: 0,
                    [ErrorSeverity.HIGH]: 1,
                    [ErrorSeverity.MEDIUM]: 2,
                    [ErrorSeverity.LOW]: 3
                };

                if (severityOrder[error.severity] < severityOrder[highestSeverity]) {
                    highestSeverity = error.severity;
                }
            }
        }
        aggregated.severity = highestSeverity;

        return aggregated;
    }

    /**
     * Create error from axios error
     * @static
     * @param {Object} axiosError - Axios error object
     * @returns {AppError} App error
     */
    static fromAxiosError(axiosError) {
        const { response, request, message } = axiosError;

        if (response) {
            // Server responded with error
            return new AppError(
                response.data?.message || message,
                {
                    code: ErrorCode.EXTERNAL_SERVICE_ERROR,
                    statusCode: response.status,
                    details: response.data,
                    context: {
                        url: response.config?.url,
                        method: response.config?.method,
                        headers: response.headers
                    }
                }
            );
        } else if (request) {
            // Request made but no response
            return new AppError('No response from server', {
                code: ErrorCode.NETWORK_ERROR,
                statusCode: 503,
                originalError: axiosError
            });
        } else {
            // Request setup error
            return new AppError(message, {
                code: ErrorCode.CONFIGURATION_ERROR,
                statusCode: 500,
                originalError: axiosError
            });
        }
    }

    /**
     * Create error from database error
     * @static
     * @param {Object} dbError - Database error
     * @returns {AppError} App error
     */
    static fromDatabaseError(dbError) {
        const errorMap = {
            'ER_DUP_ENTRY': { code: ErrorCode.ALREADY_EXISTS, status: 409 },
            'ER_NO_REFERENCED_ROW': { code: ErrorCode.INVALID_INPUT, status: 400 },
            'ER_ROW_IS_REFERENCED': { code: ErrorCode.CONFLICT, status: 409 },
            'ER_PARSE_ERROR': { code: ErrorCode.QUERY_FAILED, status: 500 },
            'ER_ACCESS_DENIED_ERROR': { code: ErrorCode.FORBIDDEN, status: 403 },
            'ECONNREFUSED': { code: ErrorCode.CONNECTION_ERROR, status: 503 },
            'ETIMEDOUT': { code: ErrorCode.TIMEOUT, status: 504 }
        };

        const mapping = errorMap[dbError.code] || {
            code: ErrorCode.DATABASE_ERROR,
            status: 500
        };

        return new AppError(dbError.message, {
            code: mapping.code,
            statusCode: mapping.status,
            category: ErrorCategory.DATABASE,
            originalError: dbError,
            context: {
                sqlState: dbError.sqlState,
                sqlMessage: dbError.sqlMessage,
                sql: dbError.sql
            }
        });
    }

    /**
     * Convert error to JSON
     * @param {boolean} includeStack - Include stack trace
     * @returns {Object} JSON representation
     */
    toJSON(includeStack = false) {
        const json = {
            id: this.id,
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            category: this.category,
            severity: this.severity,
            timestamp: this.timestamp,
            service: this.service,
            environment: this.environment
        };

        // Add optional fields
        if (this.details) json.details = this.details;
        if (this.errors.length > 0) json.errors = this.errors;
        if (this.correlationId) json.correlationId = this.correlationId;
        if (this.requestId) json.requestId = this.requestId;
        if (this.userId) json.userId = this.userId;
        if (this.tenantId) json.tenantId = this.tenantId;
        if (this.isRetryable) json.isRetryable = this.isRetryable;

        // Add context and metadata in non-production
        if (this.environment !== 'production') {
            if (Object.keys(this.context).length > 0) json.context = this.context;
            if (Object.keys(this.metadata).length > 0) json.metadata = this.metadata;
            if (this.cause) json.cause = this.cause;
        }

        // Include stack trace if requested
        if (includeStack && this.environment !== 'production') {
            json.stack = this.stack;
        }

        return json;
    }

    /**
     * Convert to HTTP response format
     * @returns {Object} HTTP response
     */
    toHTTPResponse() {
        const response = {
            success: false,
            error: {
                code: this.code,
                message: this.message
            }
        };

        if (this.details) {
            response.error.details = this.details;
        }

        if (this.errors.length > 0) {
            response.errors = this.errors;
        }

        if (this.requestId) {
            response.requestId = this.requestId;
        }

        if (this.isRetryable) {
            response.retryable = true;
        }

        return response;
    }

    /**
     * Log the error
     * @param {Object} logger - Logger instance
     */
    log(logger) {
        if (this.isLogged) return;

        const logData = {
            errorId: this.id,
            code: this.code,
            category: this.category,
            severity: this.severity,
            context: this.context,
            metadata: this.metadata,
            stack: this.stack
        };

        // Log based on severity
        switch (this.severity) {
            case ErrorSeverity.CRITICAL:
                logger.fatal(this.message, logData);
                break;
            case ErrorSeverity.HIGH:
                logger.error(this.message, logData);
                break;
            case ErrorSeverity.MEDIUM:
                logger.warn(this.message, logData);
                break;
            default:
                logger.info(this.message, logData);
        }

        this.isLogged = true;
    }

    /**
     * Report error to monitoring service
     * @param {Object} reporter - Error reporter service
     */
    async report(reporter) {
        if (this.isReported) return;

        try {
            await reporter.report(this);
            this.isReported = true;
        } catch (error) {
            console.error('Failed to report error:', error);
        }
    }

    /**
     * Check if error is a specific type
     * @param {string} code - Error code
     * @returns {boolean}
     */
    is(code) {
        return this.code === code;
    }

    /**
     * Add context to error
     * @param {string} key - Context key
     * @param {any} value - Context value
     * @returns {AppError} This error instance
     */
    addContext(key, value) {
        this.context[key] = value;
        return this;
    }

    /**
     * Add metadata to error
     * @param {string} key - Metadata key
     * @param {any} value - Metadata value
     * @returns {AppError} This error instance
     */
    addMetadata(key, value) {
        this.metadata[key] = value;
        return this;
    }

    /**
     * Static factory methods
     */

    static unauthorized(message = 'Unauthorized', options = {}) {
        return new AppError(message, {
            ...options,
            code: ErrorCode.UNAUTHORIZED,
            statusCode: 401
        });
    }

    static forbidden(message = 'Forbidden', options = {}) {
        return new AppError(message, {
            ...options,
            code: ErrorCode.FORBIDDEN,
            statusCode: 403
        });
    }

    static notFound(resource = 'Resource', options = {}) {
        return new AppError(`${resource} not found`, {
            ...options,
            code: ErrorCode.NOT_FOUND,
            statusCode: 404
        });
    }

    static validation(message, errors = [], options = {}) {
        return new AppError(message, {
            ...options,
            code: ErrorCode.VALIDATION_FAILED,
            statusCode: 422,
            errors
        });
    }

    static conflict(message = 'Resource conflict', options = {}) {
        return new AppError(message, {
            ...options,
            code: ErrorCode.CONFLICT,
            statusCode: 409
        });
    }

    static rateLimit(message = 'Rate limit exceeded', options = {}) {
        return new AppError(message, {
            ...options,
            code: ErrorCode.RATE_LIMIT_EXCEEDED,
            statusCode: 429,
            isRetryable: true
        });
    }

    static database(message = 'Database error', options = {}) {
        return new AppError(message, {
            ...options,
            code: ErrorCode.DATABASE_ERROR,
            statusCode: 500,
            category: ErrorCategory.DATABASE
        });
    }

    static external(message = 'External service error', options = {}) {
        return new AppError(message, {
            ...options,
            code: ErrorCode.EXTERNAL_SERVICE_ERROR,
            statusCode: 502,
            category: ErrorCategory.EXTERNAL_SERVICE,
            isRetryable: true
        });
    }

    static timeout(message = 'Request timeout', options = {}) {
        return new AppError(message, {
            ...options,
            code: ErrorCode.TIMEOUT,
            statusCode: 504,
            isRetryable: true
        });
    }

    static internal(message = 'Internal server error', options = {}) {
        return new AppError(message, {
            ...options,
            code: ErrorCode.INTERNAL_ERROR,
            statusCode: 500,
            severity: ErrorSeverity.HIGH
        });
    }

    static businessLogic(message, options = {}) {
        return new AppError(message, {
            ...options,
            code: ErrorCode.BUSINESS_RULE_VIOLATION,
            statusCode: 422,
            category: ErrorCategory.BUSINESS_LOGIC
        });
    }

    /**
     * Wrap an error
     * @param {Error} error - Original error
     * @param {string} message - New message
     * @param {Object} options - Additional options
     * @returns {AppError}
     */
    static wrap(error, message = null, options = {}) {
        if (error instanceof AppError) {
            return error;
        }

        return new AppError(message || error.message, {
            ...options,
            originalError: error,
            cause: error,
            stack: error.stack
        });
    }

    /**
     * Create from validation result
     * @param {Object} validationResult - Validation result
     * @returns {AppError}
     */
    static fromValidation(validationResult) {
        const errors = validationResult.errors || [];
        const message = errors.length > 0 ?
            `Validation failed: ${errors[0].message}` :
            'Validation failed';

        return new AppError(message, {
            code: ErrorCode.VALIDATION_FAILED,
            statusCode: 422,
            errors: errors.map(e => ({
                field: e.field || e.path,
                message: e.message,
                value: e.value
            }))
        });
    }

    /**
     * Check if error is operational
     * @param {Error} error - Error to check
     * @returns {boolean}
     */
    static isOperational(error) {
        if (error instanceof AppError) {
            return error.isOperational;
        }
        return false;
    }
}

/**
 * Error aggregator for collecting and analyzing errors
 */
class ErrorAggregator {
    constructor(options = {}) {
        this.errors = [];
        this.maxErrors = options.maxErrors || 1000;
        this.aggregationWindow = options.aggregationWindow || 60000; // 1 minute
        this.patterns = new Map();
        this.stats = {
            total: 0,
            byCategory: {},
            bySeverity: {},
            byCode: {},
            byService: {}
        };
    }

    /**
     * Add error to aggregator
     * @param {AppError} error - Error to add
     */
    add(error) {
        this.errors.push({
            error,
            timestamp: Date.now()
        });

        // Maintain max size
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }

        // Update statistics
        this.updateStats(error);

        // Detect patterns
        this.detectPatterns(error);
    }

    /**
     * Update statistics
     * @private
     * @param {AppError} error - Error to analyze
     */
    updateStats(error) {
        this.stats.total++;

        // By category
        this.stats.byCategory[error.category] =
            (this.stats.byCategory[error.category] || 0) + 1;

        // By severity
        this.stats.bySeverity[error.severity] =
            (this.stats.bySeverity[error.severity] || 0) + 1;

        // By code
        this.stats.byCode[error.code] =
            (this.stats.byCode[error.code] || 0) + 1;

        // By service
        this.stats.byService[error.service] =
            (this.stats.byService[error.service] || 0) + 1;
    }

    /**
     * Detect error patterns
     * @private
     * @param {AppError} error - Error to analyze
     */
    detectPatterns(error) {
        const fingerprint = error.createFingerprint();

        if (!this.patterns.has(fingerprint)) {
            this.patterns.set(fingerprint, {
                count: 0,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                example: error
            });
        }

        const pattern = this.patterns.get(fingerprint);
        pattern.count++;
        pattern.lastSeen = Date.now();
    }

    /**
     * Get recent errors
     * @param {number} limit - Number of errors to return
     * @returns {Array} Recent errors
     */
    getRecent(limit = 10) {
        return this.errors
            .slice(-limit)
            .map(item => item.error)
            .reverse();
    }

    /**
     * Get errors by time window
     * @param {number} windowMs - Time window in milliseconds
     * @returns {Array} Errors within window
     */
    getByTimeWindow(windowMs) {
        const cutoff = Date.now() - windowMs;
        return this.errors
            .filter(item => item.timestamp > cutoff)
            .map(item => item.error);
    }

    /**
     * Get error patterns
     * @param {number} minOccurrences - Minimum occurrences
     * @returns {Array} Error patterns
     */
    getPatterns(minOccurrences = 2) {
        const patterns = [];

        for (const [fingerprint, data] of this.patterns) {
            if (data.count >= minOccurrences) {
                patterns.push({
                    fingerprint,
                    ...data,
                    frequency: data.count / ((data.lastSeen - data.firstSeen) / 1000 || 1)
                });
            }
        }

        return patterns.sort((a, b) => b.count - a.count);
    }

    /**
     * Get statistics
     * @returns {Object} Error statistics
     */
    getStats() {
        const windowErrors = this.getByTimeWindow(this.aggregationWindow);

        return {
            ...this.stats,
            recentCount: windowErrors.length,
            errorRate: windowErrors.length / (this.aggregationWindow / 1000),
            topErrors: Object.entries(this.stats.byCode)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([code, count]) => ({ code, count })),
            criticalErrors: this.errors
                .filter(item => item.error.severity === ErrorSeverity.CRITICAL)
                .length
        };
    }

    /**
     * Clear aggregator
     */
    clear() {
        this.errors = [];
        this.patterns.clear();
        this.stats = {
            total: 0,
            byCategory: {},
            bySeverity: {},
            byCode: {},
            byService: {}
        };
    }

    /**
     * Export errors for analysis
     * @returns {Object} Exported data
     */
    export() {
        return {
            errors: this.errors.map(item => ({
                ...item.error.toJSON(true),
                timestamp: item.timestamp
            })),
            patterns: Array.from(this.patterns.entries()).map(([fingerprint, data]) => ({
                fingerprint,
                ...data,
                example: data.example.toJSON()
            })),
            stats: this.getStats(),
            exportedAt: new Date().toISOString()
        };
    }
}

/**
 * Error handler middleware for Express
 */
class ErrorHandler {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.reporter = options.reporter || null;
        this.includeStackTrace = options.includeStackTrace || false;
        this.defaultMessage = options.defaultMessage || 'An error occurred';
    }

    /**
     * Express error handler middleware
     */
    middleware() {
        return async (err, req, res, next) => {
            // Convert to AppError if needed
            const error = err instanceof AppError ? err : AppError.wrap(err);

            // Add request context
            error.requestId = req.id || req.headers['x-request-id'];
            error.correlationId = req.correlationId;
            error.userId = req.user?.id;
            error.tenantId = req.tenant?.id;

            // Log error
            error.log(this.logger);

            // Report to monitoring service
            if (this.reporter && error.severity === ErrorSeverity.HIGH) {
                await error.report(this.reporter);
            }

            // Send response
            const response = error.toHTTPResponse();

            // Add stack trace in development
            if (this.includeStackTrace && process.env.NODE_ENV !== 'production') {
                response.stack = error.stack;
            }

            res.status(error.statusCode).json(response);
        };
    }

    /**
     * Async error wrapper
     */
    asyncWrapper(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    /**
     * Handle uncaught exceptions
     */
    handleUncaughtException() {
        process.on('uncaughtException', (error) => {
            const appError = AppError.wrap(error, 'Uncaught Exception', {
                severity: ErrorSeverity.CRITICAL,
                isOperational: false
            });

            appError.log(this.logger);

            // Graceful shutdown
            process.exit(1);
        });
    }

    /**
     * Handle unhandled rejections
     */
    handleUnhandledRejection() {
        process.on('unhandledRejection', (reason, promise) => {
            const appError = new AppError('Unhandled Promise Rejection', {
                severity: ErrorSeverity.HIGH,
                isOperational: false,
                context: {
                    reason: reason?.toString(),
                    promise: promise?.toString()
                }
            });

            appError.log(this.logger);
        });
    }

    /**
     * Create error boundary for async operations
     */
    errorBoundary(fn) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                const appError = AppError.wrap(error);
                appError.log(this.logger);

                if (this.reporter) {
                    await appError.report(this.reporter);
                }

                throw appError;
            }
        };
    }

    /**
     * Format error for different output formats
     * @param {AppError} error - Error to format
     * @param {string} format - Output format
     * @returns {any} Formatted error
     */
    formatError(error, format = 'json') {
        switch (format) {
            case 'json':
                return error.toJSON();
            case 'http':
                return error.toHTTPResponse();
            case 'sentry':
                return error.toSentryFormat();
            case 'text':
                return error.getDeveloperMessage();
            case 'user':
                return error.getUserMessage();
            default:
                return error.toJSON();
        }
    }
}

// Export
module.exports = {
    AppError,
    ErrorHandler,
    ErrorAggregator,
    ErrorCode,
    ErrorCategory,
    ErrorSeverity,
    StatusCodeMap,
    RecoveryStrategy,
    ErrorPattern
};
