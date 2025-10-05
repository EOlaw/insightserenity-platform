/**
 * @fileoverview Comprehensive Logger Utility
 * @module shared/lib/utils/logger
 * @description Production-ready logger with multiple transports, log levels, and formatting options
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const util = require('util');
const { v4: uuidv4 } = require('uuid');

/**
 * Logger Configuration
 */
const LoggerConfig = {
    levels: {
        fatal: 0,
        error: 1,
        warn: 2,
        info: 3,
        debug: 4,
        trace: 5
    },
    colors: {
        fatal: 'red bold',
        error: 'red',
        warn: 'yellow',
        info: 'green',
        debug: 'blue',
        trace: 'gray'
    },
    defaultMeta: {
        service: process.env.SERVICE_NAME || 'insightserenity',
        environment: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '1.0.0'
    }
};

/**
 * Custom log transport base class
 */
class CustomTransport {
    constructor(options = {}) {
        this.name = options.name || 'custom';
        this.level = options.level || 'info';
        this.enabled = options.enabled !== false;
    }

    async log(info) {
        throw new Error('log method must be implemented');
    }
}

/**
 * Database log transport
 */
class DatabaseTransport extends CustomTransport {
    constructor(options = {}) {
        super(options);
        this.tableName = options.tableName || 'logs';
        this.batchSize = options.batchSize || 100;
        this.flushInterval = options.flushInterval || 5000;
        this.batch = [];

        if (options.autoFlush !== false) {
            this.startAutoFlush();
        }
    }

    async log(info) {
        this.batch.push({
            ...info,
            timestamp: new Date()
        });

        if (this.batch.length >= this.batchSize) {
            await this.flush();
        }
    }

    async flush() {
        if (this.batch.length === 0) return;

        const logs = [...this.batch];
        this.batch = [];

        // Insert logs to database (mock implementation)
        // In production, use actual database client
        console.log(`Flushing ${logs.length} logs to database`);
    }

    startAutoFlush() {
        this.flushTimer = setInterval(() => {
            this.flush().catch(console.error);
        }, this.flushInterval);
    }

    stopAutoFlush() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
}

/**
 * Webhook log transport
 */
class WebhookTransport extends CustomTransport {
    constructor(options = {}) {
        super(options);
        this.url = options.url;
        this.headers = options.headers || {};
        this.method = options.method || 'POST';
        this.batchMode = options.batchMode || false;
        this.batch = [];
        this.batchSize = options.batchSize || 10;
    }

    async log(info) {
        if (this.batchMode) {
            this.batch.push(info);
            if (this.batch.length >= this.batchSize) {
                await this.sendBatch();
            }
        } else {
            await this.send(info);
        }
    }

    async send(data) {
        // Mock implementation - in production use actual HTTP client
        console.log(`Sending log to webhook: ${this.url}`);
    }

    async sendBatch() {
        if (this.batch.length === 0) return;
        const logs = [...this.batch];
        this.batch = [];
        await this.send(logs);
    }
}

/**
 * Log filter for advanced filtering
 */
class LogFilter {
    constructor(options = {}) {
        this.includePatterns = options.includePatterns || [];
        this.excludePatterns = options.excludePatterns || [];
        this.levelFilter = options.levelFilter || null;
        this.contextFilter = options.contextFilter || {};
    }

    shouldLog(info) {
        // Check level filter
        if (this.levelFilter && info.level !== this.levelFilter) {
            return false;
        }

        // Check exclude patterns
        for (const pattern of this.excludePatterns) {
            if (this.matchesPattern(info.message, pattern)) {
                return false;
            }
        }

        // Check include patterns
        if (this.includePatterns.length > 0) {
            let matches = false;
            for (const pattern of this.includePatterns) {
                if (this.matchesPattern(info.message, pattern)) {
                    matches = true;
                    break;
                }
            }
            if (!matches) return false;
        }

        // Check context filter
        for (const [key, value] of Object.entries(this.contextFilter)) {
            if (info[key] !== value) {
                return false;
            }
        }

        return true;
    }

    matchesPattern(message, pattern) {
        if (pattern instanceof RegExp) {
            return pattern.test(message);
        }
        return message.includes(pattern);
    }
}

/**
 * Log analytics for analyzing log patterns
 */
class LogAnalytics {
    constructor() {
        this.patterns = new Map();
        this.errorPatterns = new Map();
        this.performanceMetrics = [];
        this.logFrequency = new Map();
        this.startTime = Date.now();
    }

    analyze(info) {
        // Track log frequency
        const minute = Math.floor(Date.now() / 60000);
        if (!this.logFrequency.has(minute)) {
            this.logFrequency.set(minute, { count: 0, levels: {} });
        }
        const freq = this.logFrequency.get(minute);
        freq.count++;
        freq.levels[info.level] = (freq.levels[info.level] || 0) + 1;

        // Track error patterns
        if (info.level === 'error' || info.level === 'fatal') {
            this.trackErrorPattern(info);
        }

        // Track performance metrics
        if (info.duration) {
            this.trackPerformance(info);
        }

        // Detect patterns
        this.detectPatterns(info);
    }

    trackErrorPattern(info) {
        const key = `${info.message}::${info.code || 'unknown'}`;
        if (!this.errorPatterns.has(key)) {
            this.errorPatterns.set(key, {
                count: 0,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                examples: []
            });
        }

        const pattern = this.errorPatterns.get(key);
        pattern.count++;
        pattern.lastSeen = Date.now();
        if (pattern.examples.length < 5) {
            pattern.examples.push(info);
        }
    }

    trackPerformance(info) {
        this.performanceMetrics.push({
            operation: info.message,
            duration: info.duration,
            timestamp: Date.now()
        });

        // Keep only last 1000 metrics
        if (this.performanceMetrics.length > 1000) {
            this.performanceMetrics = this.performanceMetrics.slice(-1000);
        }
    }

    detectPatterns(info) {
        // Simple pattern detection based on message similarity
        const words = info.message.toLowerCase().split(/\s+/);
        for (const word of words) {
            if (word.length > 3) {
                if (!this.patterns.has(word)) {
                    this.patterns.set(word, 0);
                }
                this.patterns.set(word, this.patterns.get(word) + 1);
            }
        }
    }

    getReport() {
        const uptime = Date.now() - this.startTime;
        const totalLogs = Array.from(this.logFrequency.values())
            .reduce((sum, freq) => sum + freq.count, 0);

        return {
            uptime,
            totalLogs,
            logsPerMinute: totalLogs / (uptime / 60000),
            errorPatterns: Array.from(this.errorPatterns.entries())
                .map(([key, data]) => ({ pattern: key, ...data }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10),
            topPatterns: Array.from(this.patterns.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20)
                .map(([word, count]) => ({ word, count })),
            performanceSummary: this.getPerformanceSummary(),
            logDistribution: this.getLogDistribution()
        };
    }

    getPerformanceSummary() {
        if (this.performanceMetrics.length === 0) {
            return null;
        }

        const durations = this.performanceMetrics.map(m => m.duration);
        durations.sort((a, b) => a - b);

        return {
            count: durations.length,
            min: durations[0],
            max: durations[durations.length - 1],
            avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
            median: durations[Math.floor(durations.length / 2)],
            p95: durations[Math.floor(durations.length * 0.95)],
            p99: durations[Math.floor(durations.length * 0.99)]
        };
    }

    getLogDistribution() {
        const distribution = {};
        for (const freq of this.logFrequency.values()) {
            for (const [level, count] of Object.entries(freq.levels)) {
                distribution[level] = (distribution[level] || 0) + count;
            }
        }
        return distribution;
    }
}

/**
 * Comprehensive Logger Class
 * @class Logger
 */
class Logger {
    /**
     * Creates an instance of Logger
     * @param {Object} options - Logger configuration options
     */
    constructor(options = {}) {
        this.serviceName = options.serviceName || process.env.SERVICE_NAME || 'app';
        this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
        this.logDir = options.logDir || process.env.LOG_DIR || path.join(process.cwd(), 'logs');
        this.enableConsole = options.enableConsole !== false;
        this.enableFile = options.enableFile !== false && process.env.NODE_ENV !== 'test';
        this.enableRotation = options.enableRotation !== false;
        this.enableJson = options.enableJson || process.env.NODE_ENV === 'production';
        this.enableTimestamp = options.enableTimestamp !== false;
        this.enableErrors = options.enableErrors !== false;
        this.enableProfiling = options.enableProfiling || false;
        this.enableMetrics = options.enableMetrics || false;
        this.enableAnalytics = options.enableAnalytics || false;
        this.enableFiltering = options.enableFiltering || false;

        // Context and metadata
        this.context = options.context || {};
        this.requestIdHeader = options.requestIdHeader || 'x-request-id';
        this.options = options;

        // Performance tracking
        this.metrics = {
            logCounts: {},
            errors: [],
            performance: []
        };

        // Custom transports
        this.customTransports = [];

        // Log filter
        this.filter = options.filter ? new LogFilter(options.filter) : null;

        // Log analytics
        this.analytics = this.enableAnalytics ? new LogAnalytics() : null;

        // Structured logging fields
        this.structuredFields = options.structuredFields || {};

        // Log buffer for async operations
        this.logBuffer = [];
        this.bufferSize = options.bufferSize || 100;
        this.flushInterval = options.flushInterval || 5000;

        // Ensure log directory exists
        this._ensureLogDirectory();

        // Initialize Winston logger
        this.logger = this._createLogger();

        // Add custom log levels
        winston.addColors(LoggerConfig.colors);

        // Start buffer flush timer
        if (options.enableBuffer) {
            this.startBufferFlush();
        }

        // Bind methods
        this.fatal = this.fatal.bind(this);
        this.error = this.error.bind(this);
        this.warn = this.warn.bind(this);
        this.info = this.info.bind(this);
        this.debug = this.debug.bind(this);
        this.trace = this.trace.bind(this);
    }

    /**
     * Ensures log directory exists
     * @private
     */
    _ensureLogDirectory() {
        if (this.enableFile && !fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Creates Winston logger instance
     * @private
     * @returns {winston.Logger} Winston logger
     */
    _createLogger() {
        const formats = [];

        // Add timestamp
        if (this.enableTimestamp) {
            formats.push(winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS'
            }));
        }

        // Add errors with stack trace
        if (this.enableErrors) {
            formats.push(winston.format.errors({ stack: true }));
        }

        // Add metadata
        formats.push(winston.format.metadata({
            fillExcept: ['message', 'level', 'timestamp', 'label']
        }));

        // Custom format for detailed logging
        const customFormat = winston.format.printf(({ level, message, timestamp, metadata, ...rest }) => {
            const metaStr = Object.keys(metadata || {}).length ?
                `\n${JSON.stringify(metadata, null, 2)}` : '';

            if (this.enableJson) {
                return JSON.stringify({
                    timestamp,
                    level,
                    service: this.serviceName,
                    message,
                    ...metadata,
                    ...rest
                });
            }

            return `${timestamp} [${this.serviceName}] ${level}: ${message}${metaStr}`;
        });

        formats.push(customFormat);

        // Create transports
        const transports = [];

        // Console transport
        if (this.enableConsole) {
            transports.push(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    ...formats
                ),
                level: this.logLevel
            }));
        }

        // File transports with rotation
        if (this.enableFile) {
            // Error log file
            transports.push(new DailyRotateFile({
                filename: path.join(this.logDir, `${this.serviceName}-error-%DATE%.log`),
                datePattern: 'YYYY-MM-DD',
                zippedArchive: true,
                maxSize: '20m',
                maxFiles: '14d',
                level: 'error',
                format: winston.format.combine(...formats)
            }));

            // Combined log file
            transports.push(new DailyRotateFile({
                filename: path.join(this.logDir, `${this.serviceName}-combined-%DATE%.log`),
                datePattern: 'YYYY-MM-DD',
                zippedArchive: true,
                maxSize: '20m',
                maxFiles: '14d',
                format: winston.format.combine(...formats)
            }));

            // Debug log file (only in development)
            if (process.env.NODE_ENV === 'development') {
                transports.push(new DailyRotateFile({
                    filename: path.join(this.logDir, `${this.serviceName}-debug-%DATE%.log`),
                    datePattern: 'YYYY-MM-DD',
                    zippedArchive: true,
                    maxSize: '20m',
                    maxFiles: '7d',
                    level: 'debug',
                    format: winston.format.combine(...formats)
                }));
            }
        }

        // Create logger
        return winston.createLogger({
            levels: LoggerConfig.levels,
            defaultMeta: {
                ...LoggerConfig.defaultMeta,
                service: this.serviceName,
                ...this.context
            },
            transports,
            exitOnError: false
        });
    }

    /**
     * Add custom transport
     * @param {CustomTransport} transport - Custom transport instance
     */
    addTransport(transport) {
        this.customTransports.push(transport);
    }

    /**
     * Remove custom transport
     * @param {string} name - Transport name
     */
    removeTransport(name) {
        this.customTransports = this.customTransports.filter(t => t.name !== name);
    }

    /**
     * Set log filter
     * @param {Object} filterOptions - Filter options
     */
    setFilter(filterOptions) {
        this.filter = new LogFilter(filterOptions);
    }

    /**
     * Clear log filter
     */
    clearFilter() {
        this.filter = null;
    }

    /**
     * Add structured field
     * @param {string} key - Field key
     * @param {any} value - Field value
     */
    addStructuredField(key, value) {
        this.structuredFields[key] = value;
    }

    /**
     * Remove structured field
     * @param {string} key - Field key
     */
    removeStructuredField(key) {
        delete this.structuredFields[key];
    }

    /**
     * Log with structured data
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Structured data
     */
    logStructured(level, message, data = {}) {
        const structured = {
            ...this.structuredFields,
            ...data,
            '@timestamp': new Date().toISOString(),
            '@version': '1',
            level,
            message,
            service: this.serviceName,
            environment: process.env.NODE_ENV
        };

        this._log(level, message, structured);
    }

    /**
     * Log audit event
     * @param {Object} event - Audit event
     */
    audit(event) {
        const auditLog = {
            type: 'audit',
            timestamp: new Date().toISOString(),
            actor: event.actor || 'system',
            action: event.action,
            resource: event.resource,
            result: event.result || 'success',
            details: event.details || {},
            ip: event.ip,
            userAgent: event.userAgent
        };

        this.info('Audit event', auditLog);
    }

    /**
     * Log security event
     * @param {Object} event - Security event
     */
    security(event) {
        const securityLog = {
            type: 'security',
            timestamp: new Date().toISOString(),
            severity: event.severity || 'medium',
            category: event.category,
            description: event.description,
            source: event.source,
            target: event.target,
            action: event.action,
            outcome: event.outcome
        };

        const level = event.severity === 'critical' ? 'fatal' :
                     event.severity === 'high' ? 'error' :
                     event.severity === 'medium' ? 'warn' : 'info';

        this[level]('Security event', securityLog);
    }

    /**
     * Log business event
     * @param {Object} event - Business event
     */
    business(event) {
        const businessLog = {
            type: 'business',
            timestamp: new Date().toISOString(),
            eventType: event.type,
            userId: event.userId,
            organizationId: event.organizationId,
            action: event.action,
            entity: event.entity,
            entityId: event.entityId,
            metadata: event.metadata || {}
        };

        this.info('Business event', businessLog);
    }

    /**
     * Buffer log for batch processing
     * @private
     * @param {Object} logEntry - Log entry
     */
    _bufferLog(logEntry) {
        this.logBuffer.push(logEntry);

        if (this.logBuffer.length >= this.bufferSize) {
            this.flushBuffer();
        }
    }

    /**
     * Flush log buffer
     */
    async flushBuffer() {
        if (this.logBuffer.length === 0) return;

        const logs = [...this.logBuffer];
        this.logBuffer = [];

        // Process buffered logs
        for (const log of logs) {
            // Send to custom transports
            for (const transport of this.customTransports) {
                if (transport.enabled) {
                    try {
                        await transport.log(log);
                    } catch (error) {
                        console.error(`Transport ${transport.name} error:`, error);
                    }
                }
            }
        }
    }

    /**
     * Start buffer flush timer
     */
    startBufferFlush() {
        this.bufferFlushTimer = setInterval(() => {
            this.flushBuffer().catch(console.error);
        }, this.flushInterval);
    }

    /**
     * Stop buffer flush timer
     */
    stopBufferFlush() {
        if (this.bufferFlushTimer) {
            clearInterval(this.bufferFlushTimer);
            this.bufferFlushTimer = null;
        }
    }

    /**
     * Internal log method with enhanced features
     * @private
     */
    _log(level, message, meta = {}) {
        // Apply filter if enabled
        if (this.filter) {
            const info = { level, message, ...meta };
            if (!this.filter.shouldLog(info)) {
                return;
            }
        }

        // Handle Error objects
        if (message instanceof Error) {
            meta.error = {
                message: message.message,
                stack: message.stack,
                code: message.code,
                name: message.name
            };
            message = message.message;
        }

        // Handle object messages
        if (typeof message === 'object') {
            meta = { ...message, ...meta };
            message = util.inspect(message, { depth: 3 });
        }

        // Add correlation ID if available
        if (this.correlationId) {
            meta.correlationId = this.correlationId;
        }

        // Add request ID if available
        if (this.requestId) {
            meta.requestId = this.requestId;
        }

        // Add structured fields
        meta = { ...this.structuredFields, ...meta };

        // Create log entry
        const logEntry = {
            level,
            message,
            ...meta,
            timestamp: new Date().toISOString()
        };

        // Perform analytics if enabled
        if (this.analytics) {
            this.analytics.analyze(logEntry);
        }

        // Buffer log if enabled
        if (this.options.enableBuffer) {
            this._bufferLog(logEntry);
        }

        // Log with Winston
        this.logger.log(level, message, meta);

        // Update metrics
        if (this.enableMetrics) {
            this.metrics.logCounts[level] = (this.metrics.logCounts[level] || 0) + 1;
        }
    }

    /**
     * Log methods for different levels
     */

    fatal(message, meta = {}) {
        this._log('fatal', message, meta);
        // Fatal errors might require immediate attention
        if (this.enableMetrics) {
            this._recordMetric('fatal', message);
        }
    }

    error(message, meta = {}) {
        this._log('error', message, meta);
        if (this.enableMetrics) {
            this._recordMetric('error', message);
        }
    }

    warn(message, meta = {}) {
        this._log('warn', message, meta);
    }

    info(message, meta = {}) {
        this._log('info', message, meta);
    }

    debug(message, meta = {}) {
        this._log('debug', message, meta);
    }

    trace(message, meta = {}) {
        this._log('trace', message, meta);
    }

    /**
     * Record metrics for monitoring
     * @private
     */
    _recordMetric(level, message) {
        const metric = {
            level,
            message: message.substring(0, 100),
            timestamp: new Date().toISOString(),
            service: this.serviceName
        };

        if (level === 'error' || level === 'fatal') {
            this.metrics.errors.push(metric);
            // Keep only last 100 errors
            if (this.metrics.errors.length > 100) {
                this.metrics.errors = this.metrics.errors.slice(-100);
            }
        }
    }

    /**
     * Create child logger with additional context
     * @param {Object} context - Additional context
     * @returns {Logger} Child logger
     */
    child(context = {}) {
        return new Logger({
            ...this.options,
            context: { ...this.context, ...context }
        });
    }

    /**
     * Start profiling
     * @param {string} id - Profile ID
     */
    startProfile(id) {
        if (this.enableProfiling) {
            this.logger.profile(id);
        }
    }

    /**
     * End profiling
     * @param {string} id - Profile ID
     * @param {Object} meta - Additional metadata
     */
    endProfile(id, meta = {}) {
        if (this.enableProfiling) {
            this.logger.profile(id, meta);
        }
    }

    /**
     * Start timer for performance tracking
     * @param {string} label - Timer label
     * @returns {Function} End timer function
     */
    startTimer(label) {
        const start = Date.now();

        return (meta = {}) => {
            const duration = Date.now() - start;
            this.debug(`${label} completed`, {
                duration: `${duration}ms`,
                ...meta
            });

            if (this.enableMetrics) {
                this.metrics.performance.push({
                    label,
                    duration,
                    timestamp: new Date().toISOString()
                });
            }

            return duration;
        };
    }

    /**
     * Log HTTP request
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    logRequest(req, res) {
        const start = Date.now();

        // Generate or get request ID
        const requestId = req.headers[this.requestIdHeader] || uuidv4();
        req.id = requestId;

        // Log request
        this.info('Incoming request', {
            requestId,
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.get('user-agent')
        });

        // Log response
        const originalSend = res.send;
        res.send = function(data) {
            res.send = originalSend;
            const duration = Date.now() - start;

            this.info('Request completed', {
                requestId,
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                duration: `${duration}ms`
            });

            return res.send(data);
        }.bind(this);
    }

    /**
     * Express middleware
     * @returns {Function} Express middleware function
     */
    middleware() {
        return (req, res, next) => {
            // Generate request ID
            const requestId = req.headers[this.requestIdHeader] || uuidv4();
            req.id = requestId;
            res.setHeader('X-Request-ID', requestId);

            // Store request ID in logger context
            this.requestId = requestId;

            // Log request
            const start = Date.now();
            this.info('Incoming request', {
                requestId,
                method: req.method,
                url: req.url,
                ip: req.ip,
                userAgent: req.get('user-agent')
            });

            // Log response
            res.on('finish', () => {
                const duration = Date.now() - start;
                const level = res.statusCode >= 400 ? 'error' : 'info';

                this[level]('Request completed', {
                    requestId,
                    method: req.method,
                    url: req.url,
                    statusCode: res.statusCode,
                    duration: `${duration}ms`
                });

                // Clear request ID
                this.requestId = null;
            });

            next();
        };
    }

    /**
     * Stream logs (for real-time monitoring)
     * @param {Object} options - Stream options
     * @returns {Object} Log stream
     */
    stream(options = {}) {
        return {
            write: (message) => {
                this.info(message.trim());
            }
        };
    }

    /**
     * Get metrics
     * @returns {Object} Logger metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Clear metrics
     */
    clearMetrics() {
        this.metrics = {
            logCounts: {},
            errors: [],
            performance: []
        };
    }

    /**
     * Query logs (for searching through log files)
     * @param {Object} query - Query parameters
     * @returns {Promise<Array>} Log entries
     */
    async queryLogs(query = {}) {
        // This would typically interface with a log aggregation service
        // For now, return a placeholder
        return [];
    }

    /**
     * Flush logs (ensure all logs are written)
     * @returns {Promise<void>}
     */
    async flush() {
        return new Promise((resolve) => {
            if (this.logger.transports.length > 0) {
                let pending = this.logger.transports.length;

                this.logger.transports.forEach(transport => {
                    transport.on('finish', () => {
                        if (--pending === 0) {
                            resolve();
                        }
                    });
                    transport.end();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Close logger and cleanup
     */
    async close() {
        await this.flush();
        this.logger.close();
    }

    /**
     * Get analytics report
     * @returns {Object} Analytics report
     */
    getAnalyticsReport() {
        if (!this.analytics) {
            return null;
        }
        return this.analytics.getReport();
    }

    /**
     * Search logs
     * @param {Object} criteria - Search criteria
     * @returns {Promise<Array>} Matching log entries
     */
    async searchLogs(criteria = {}) {
        const {
            startDate,
            endDate,
            level,
            pattern,
            limit = 100
        } = criteria;

        // This would typically interface with a log storage system
        // For now, return a placeholder
        return [];
    }

    /**
     * Export logs
     * @param {Object} options - Export options
     * @returns {Promise<string>} Export file path
     */
    async exportLogs(options = {}) {
        const {
            format = 'json',
            startDate = new Date(Date.now() - 86400000),
            endDate = new Date(),
            outputPath = path.join(this.logDir, `export-${Date.now()}.${format}`)
        } = options;

        // This would typically export logs from storage
        // For now, return a placeholder
        return outputPath;
    }

    /**
     * Rotate logs manually
     */
    async rotateLogs() {
        // Trigger rotation for all file transports
        for (const transport of this.logger.transports) {
            if (transport.rotate && typeof transport.rotate === 'function') {
                await transport.rotate();
            }
        }
    }

    /**
     * Get log statistics
     * @returns {Object} Log statistics
     */
    getStatistics() {
        const stats = {
            ...this.metrics,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            customTransports: this.customTransports.length,
            bufferSize: this.logBuffer.length
        };

        if (this.analytics) {
            stats.analytics = this.analytics.getReport();
        }

        return stats;
    }

    /**
     * Create contextual logger
     * @param {Object} context - Additional context
     * @returns {Object} Contextual logger
     */
    createContextualLogger(context) {
        const self = this;
        return {
            fatal: (message, meta) => self.fatal(message, { ...context, ...meta }),
            error: (message, meta) => self.error(message, { ...context, ...meta }),
            warn: (message, meta) => self.warn(message, { ...context, ...meta }),
            info: (message, meta) => self.info(message, { ...context, ...meta }),
            debug: (message, meta) => self.debug(message, { ...context, ...meta }),
            trace: (message, meta) => self.trace(message, { ...context, ...meta })
        };
    }

    /**
     * Log with tags
     * @param {string} level - Log level
     * @param {string} message - Message
     * @param {Array<string>} tags - Tags
     * @param {Object} meta - Metadata
     */
    logWithTags(level, message, tags = [], meta = {}) {
        this._log(level, message, { ...meta, tags });
    }

    /**
     * Create scoped logger
     * @param {string} scope - Logger scope
     * @returns {Logger} Scoped logger
     */
    scope(scope) {
        return new Logger({
            ...this.options,
            serviceName: `${this.serviceName}:${scope}`,
            context: { ...this.context, scope }
        });
    }

    /**
     * Log method execution
     * @param {string} methodName - Method name
     * @param {Function} fn - Method to execute
     * @returns {any} Method result
     */
    async logMethod(methodName, fn, meta = {}) {
        const startTime = Date.now();
        const timer = this.startTimer(methodName);

        try {
            this.debug(`${methodName} started`, meta);
            const result = await fn();
            const duration = timer();
            this.debug(`${methodName} completed`, { ...meta, duration });
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.error(`${methodName} failed`, {
                ...meta,
                duration,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

/**
 * Create singleton logger instance
 */
let defaultLogger = null;

/**
 * Get or create default logger
 * @param {Object} options - Logger options
 * @returns {Logger} Logger instance
 */
function getLogger(options = {}) {
    if (!defaultLogger) {
        defaultLogger = new Logger(options);
    }
    return defaultLogger;
}

/**
 * Create new logger instance
 * @param {Object} options - Logger options
 * @returns {Logger} Logger instance
 */
function createLogger(options = {}) {
    return new Logger(options);
}

// Export
module.exports = {
    Logger,
    getLogger,
    createLogger,
    LoggerConfig
};

// Export additional classes
module.exports.CustomTransport = CustomTransport;
module.exports.DatabaseTransport = DatabaseTransport;
module.exports.WebhookTransport = WebhookTransport;
module.exports.LogFilter = LogFilter;
module.exports.LogAnalytics = LogAnalytics;

/**
 * Configure global logger
 * @static
 * @param {Object} options - Logger options
 */
Logger.configure = function(options) {
    defaultLogger = new Logger(options);
    return defaultLogger;
};

/**
 * Get global logger instance
 * @static
 * @returns {Logger} Global logger
 */
Logger.getInstance = function() {
    if (!defaultLogger) {
        defaultLogger = new Logger();
    }
    return defaultLogger;
};

/**
 * Create child logger from global instance
 * @static
 * @param {Object} context - Child context
 * @returns {Logger} Child logger
 */
Logger.createChild = function(context) {
    return Logger.getInstance().child(context);
};
