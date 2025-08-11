'use strict';

/**
 * @fileoverview Logger - Winston-based centralized logging system for API Gateway
 * @module servers/gateway/utils/logger
 * @requires winston
 * @requires winston-daily-rotate-file
 * @requires path
 * @requires fs
 * @requires os
 * @requires crypto
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { format } = winston;

/**
 * Logger class implements enterprise-grade centralized logging for the API Gateway.
 * It provides structured logging, multiple transports, log rotation, performance tracking,
 * security event logging, audit trails, and distributed log aggregation.
 */
class Logger {
    /**
     * Creates an instance of Logger
     * @constructor
     * @param {Object} config - Logger configuration
     * @param {string} serviceName - Name of the service
     */
    constructor(config = {}, serviceName = 'api-gateway') {
        this.config = this.mergeConfig(config);
        this.serviceName = serviceName;
        this.hostname = os.hostname();
        this.pid = process.pid;
        
        // Log levels
        this.levels = {
            emergency: 0,
            alert: 1,
            critical: 2,
            error: 3,
            warning: 4,
            notice: 5,
            info: 6,
            debug: 7,
            trace: 8
        };
        
        // Level colors for console output
        this.levelColors = {
            emergency: 'red bold',
            alert: 'red',
            critical: 'red',
            error: 'red',
            warning: 'yellow',
            notice: 'cyan',
            info: 'green',
            debug: 'blue',
            trace: 'gray'
        };
        
        // Correlation ID storage
        this.correlationIds = new Map();
        
        // Performance tracking
        this.performanceMetrics = new Map();
        this.performanceThresholds = {
            slow: config.performance?.slowThreshold || 1000,
            verySlow: config.performance?.verySlowThreshold || 5000
        };
        
        // Audit log configuration
        this.auditConfig = {
            enabled: config.audit?.enabled !== false,
            events: config.audit?.events || ['auth', 'access', 'modification', 'deletion'],
            includeRequestBody: config.audit?.includeRequestBody || false,
            includeResponseBody: config.audit?.includeResponseBody || false,
            sensitiveFields: config.audit?.sensitiveFields || ['password', 'token', 'apiKey']
        };
        
        // Security event configuration
        this.securityConfig = {
            enabled: config.security?.enabled !== false,
            events: config.security?.events || ['intrusion', 'violation', 'authentication'],
            alertThreshold: config.security?.alertThreshold || 'warning'
        };
        
        // Error tracking
        this.errorTracking = {
            enabled: config.errorTracking?.enabled !== false,
            captureStackTrace: config.errorTracking?.captureStackTrace !== false,
            contextLines: config.errorTracking?.contextLines || 5,
            grouping: config.errorTracking?.grouping !== false
        };
        
        // Metrics collection
        this.metricsConfig = {
            enabled: config.metrics?.enabled !== false,
            interval: config.metrics?.interval || 60000,
            includeSystemMetrics: config.metrics?.includeSystemMetrics !== false
        };
        
        // Log sampling configuration
        this.samplingConfig = {
            enabled: config.sampling?.enabled || false,
            rate: config.sampling?.rate || 0.1,
            alwaysLog: config.sampling?.alwaysLog || ['error', 'critical', 'alert', 'emergency']
        };
        
        // Buffer for async logging
        this.logBuffer = [];
        this.bufferSize = config.bufferSize || 1000;
        this.flushInterval = config.flushInterval || 5000;
        
        // Statistics
        this.stats = {
            totalLogs: 0,
            logsByLevel: {},
            errors: 0,
            dropped: 0,
            buffered: 0
        };
        
        // Initialize stats for each level
        Object.keys(this.levels).forEach(level => {
            this.stats.logsByLevel[level] = 0;
        });
        
        // Create winston logger instance
        this.logger = this.createLogger();
        
        // Create specialized loggers
        this.auditLogger = this.createAuditLogger();
        this.securityLogger = this.createSecurityLogger();
        this.performanceLogger = this.createPerformanceLogger();
        
        // Start background tasks
        this.startBackgroundTasks();
        
        // Setup cleanup handlers
        this.setupCleanupHandlers();
    }

    /**
     * Merges configuration with defaults
     * @private
     * @param {Object} config - User configuration
     * @returns {Object} Merged configuration
     */
    mergeConfig(config) {
        const defaults = {
            level: process.env.LOG_LEVEL || 'info',
            console: {
                enabled: process.env.NODE_ENV !== 'production',
                colorize: true,
                prettyPrint: true
            },
            file: {
                enabled: true,
                dirname: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
                filename: 'gateway-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                maxSize: '100m',
                maxFiles: '30d',
                compress: true
            },
            syslog: {
                enabled: false,
                host: 'localhost',
                port: 514,
                protocol: 'udp4',
                facility: 'local0'
            },
            http: {
                enabled: false,
                host: 'localhost',
                port: 3000,
                path: '/logs',
                ssl: false
            },
            elasticsearch: {
                enabled: false,
                node: 'http://localhost:9200',
                index: 'gateway-logs',
                type: '_doc'
            },
            format: {
                timestamp: true,
                colorize: false,
                json: true,
                prettyPrint: false
            }
        };
        
        return this.deepMerge(defaults, config);
    }

    /**
     * Creates the main Winston logger instance
     * @private
     * @returns {winston.Logger} Winston logger instance
     */
    createLogger() {
        const transports = [];
        
        // Console transport
        if (this.config.console.enabled) {
            transports.push(this.createConsoleTransport());
        }
        
        // File transport
        if (this.config.file.enabled) {
            this.ensureLogDirectory(this.config.file.dirname);
            transports.push(this.createFileTransport());
            transports.push(this.createErrorFileTransport());
        }
        
        // Syslog transport
        if (this.config.syslog.enabled) {
            transports.push(this.createSyslogTransport());
        }
        
        // HTTP transport
        if (this.config.http.enabled) {
            transports.push(this.createHttpTransport());
        }
        
        // Elasticsearch transport
        if (this.config.elasticsearch.enabled) {
            transports.push(this.createElasticsearchTransport());
        }
        
        // Create logger
        const logger = winston.createLogger({
            levels: this.levels,
            level: this.config.level,
            format: this.createLogFormat(),
            transports,
            exitOnError: false,
            silent: false
        });
        
        // Add colors to winston
        winston.addColors(this.levelColors);
        
        return logger;
    }

    /**
     * Creates log format
     * @private
     * @returns {winston.Format} Winston format
     */
    createLogFormat() {
        const formats = [];
        
        // Add timestamp
        if (this.config.format.timestamp) {
            formats.push(
                format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss.SSS'
                })
            );
        }
        
        // Add error stack traces
        formats.push(format.errors({ stack: true }));
        
        // Add metadata
        formats.push(format.metadata({
            fillExcept: ['message', 'level', 'timestamp', 'label']
        }));
        
        // Custom format function
        formats.push(format.printf(info => {
            const {
                timestamp,
                level,
                message,
                metadata,
                ...rest
            } = info;
            
            const log = {
                timestamp,
                level,
                service: this.serviceName,
                hostname: this.hostname,
                pid: this.pid,
                message
            };
            
            // Add correlation ID if present
            const correlationId = this.getCurrentCorrelationId();
            if (correlationId) {
                log.correlationId = correlationId;
            }
            
            // Add metadata
            if (metadata && Object.keys(metadata).length > 0) {
                log.metadata = metadata;
            }
            
            // Add remaining properties
            if (Object.keys(rest).length > 0) {
                Object.assign(log, rest);
            }
            
            // Format based on configuration
            if (this.config.format.json) {
                return JSON.stringify(log);
            } else {
                return `${timestamp} [${level}] ${message}`;
            }
        }));
        
        return format.combine(...formats);
    }

    /**
     * Creates console transport
     * @private
     * @returns {winston.Transport} Console transport
     */
    createConsoleTransport() {
        const consoleFormat = [];
        
        if (this.config.console.colorize) {
            consoleFormat.push(format.colorize());
        }
        
        if (this.config.console.prettyPrint) {
            consoleFormat.push(format.prettyPrint());
        }
        
        consoleFormat.push(format.simple());
        
        return new winston.transports.Console({
            format: format.combine(...consoleFormat),
            handleExceptions: true,
            handleRejections: true
        });
    }

    /**
     * Creates file transport
     * @private
     * @returns {winston.Transport} File transport
     */
    createFileTransport() {
        return new DailyRotateFile({
            dirname: this.config.file.dirname,
            filename: this.config.file.filename,
            datePattern: this.config.file.datePattern,
            maxSize: this.config.file.maxSize,
            maxFiles: this.config.file.maxFiles,
            zippedArchive: this.config.file.compress,
            handleExceptions: true,
            handleRejections: true,
            format: format.combine(
                format.timestamp(),
                format.json()
            )
        });
    }

    /**
     * Creates error file transport
     * @private
     * @returns {winston.Transport} Error file transport
     */
    createErrorFileTransport() {
        return new DailyRotateFile({
            dirname: this.config.file.dirname,
            filename: 'error-%DATE%.log',
            datePattern: this.config.file.datePattern,
            maxSize: this.config.file.maxSize,
            maxFiles: this.config.file.maxFiles,
            level: 'error',
            zippedArchive: this.config.file.compress,
            handleExceptions: true,
            handleRejections: true,
            format: format.combine(
                format.timestamp(),
                format.json()
            )
        });
    }

    /**
     * Creates syslog transport
     * @private
     * @returns {winston.Transport} Syslog transport
     */
    createSyslogTransport() {
        const Syslog = require('winston-syslog').Syslog;
        
        return new Syslog({
            host: this.config.syslog.host,
            port: this.config.syslog.port,
            protocol: this.config.syslog.protocol,
            facility: this.config.syslog.facility,
            localhost: this.hostname,
            type: '3164',
            app_name: this.serviceName
        });
    }

    /**
     * Creates HTTP transport
     * @private
     * @returns {winston.Transport} HTTP transport
     */
    createHttpTransport() {
        return new winston.transports.Http({
            host: this.config.http.host,
            port: this.config.http.port,
            path: this.config.http.path,
            ssl: this.config.http.ssl,
            batch: true,
            batchInterval: 5000,
            batchCount: 10
        });
    }

    /**
     * Creates Elasticsearch transport
     * @private
     * @returns {winston.Transport} Elasticsearch transport
     */
    createElasticsearchTransport() {
        const ElasticsearchTransport = require('winston-elasticsearch');
        
        return new ElasticsearchTransport({
            level: this.config.level,
            clientOpts: {
                node: this.config.elasticsearch.node
            },
            index: this.config.elasticsearch.index,
            dataStream: true,
            transformer: (logData) => {
                const transformed = {
                    '@timestamp': logData.timestamp || new Date().toISOString(),
                    severity: logData.level,
                    service: this.serviceName,
                    hostname: this.hostname,
                    message: logData.message,
                    fields: logData.meta
                };
                
                return transformed;
            }
        });
    }

    /**
     * Creates audit logger
     * @private
     * @returns {winston.Logger} Audit logger
     */
    createAuditLogger() {
        if (!this.auditConfig.enabled) {
            return null;
        }
        
        const auditDir = path.join(this.config.file.dirname, 'audit');
        this.ensureLogDirectory(auditDir);
        
        return winston.createLogger({
            levels: this.levels,
            format: format.combine(
                format.timestamp(),
                format.json()
            ),
            transports: [
                new DailyRotateFile({
                    dirname: auditDir,
                    filename: 'audit-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxSize: '100m',
                    maxFiles: '90d',
                    zippedArchive: true
                })
            ]
        });
    }

    /**
     * Creates security logger
     * @private
     * @returns {winston.Logger} Security logger
     */
    createSecurityLogger() {
        if (!this.securityConfig.enabled) {
            return null;
        }
        
        const securityDir = path.join(this.config.file.dirname, 'security');
        this.ensureLogDirectory(securityDir);
        
        return winston.createLogger({
            levels: this.levels,
            format: format.combine(
                format.timestamp(),
                format.json()
            ),
            transports: [
                new DailyRotateFile({
                    dirname: securityDir,
                    filename: 'security-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxSize: '100m',
                    maxFiles: '90d',
                    zippedArchive: true
                })
            ]
        });
    }

    /**
     * Creates performance logger
     * @private
     * @returns {winston.Logger} Performance logger
     */
    createPerformanceLogger() {
        const perfDir = path.join(this.config.file.dirname, 'performance');
        this.ensureLogDirectory(perfDir);
        
        return winston.createLogger({
            levels: this.levels,
            format: format.combine(
                format.timestamp(),
                format.json()
            ),
            transports: [
                new DailyRotateFile({
                    dirname: perfDir,
                    filename: 'performance-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxSize: '100m',
                    maxFiles: '30d',
                    zippedArchive: true
                })
            ]
        });
    }

    /**
     * Main logging methods
     */
    
    emergency(message, meta = {}) {
        this.log('emergency', message, meta);
    }
    
    alert(message, meta = {}) {
        this.log('alert', message, meta);
    }
    
    critical(message, meta = {}) {
        this.log('critical', message, meta);
    }
    
    error(message, meta = {}) {
        this.log('error', message, meta);
    }
    
    warning(message, meta = {}) {
        this.log('warning', message, meta);
    }
    
    warn(message, meta = {}) {
        this.warning(message, meta);
    }
    
    notice(message, meta = {}) {
        this.log('notice', message, meta);
    }
    
    info(message, meta = {}) {
        this.log('info', message, meta);
    }
    
    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }
    
    trace(message, meta = {}) {
        this.log('trace', message, meta);
    }
    
    log(level, message, meta = {}) {
        // Check sampling
        if (this.shouldSample(level)) {
            this.stats.dropped++;
            return;
        }
        
        // Prepare log entry
        const logEntry = this.prepareLogEntry(level, message, meta);
        
        // Update statistics
        this.updateStats(level);
        
        // Check if buffering is needed
        if (this.shouldBuffer(level)) {
            this.bufferLog(logEntry);
        } else {
            this.writeLog(logEntry);
        }
    }

    /**
     * Specialized logging methods
     */
    
    audit(event, details = {}) {
        if (!this.auditConfig.enabled) return;
        
        const auditEntry = {
            event,
            timestamp: new Date().toISOString(),
            user: details.user || 'system',
            ip: details.ip,
            action: details.action,
            resource: details.resource,
            result: details.result || 'success',
            metadata: this.sanitizeAuditData(details.metadata || {})
        };
        
        if (this.auditLogger) {
            this.auditLogger.info('AUDIT', auditEntry);
        }
        
        // Also log to main logger
        this.info(`Audit: ${event}`, auditEntry);
    }
    
    security(event, details = {}) {
        if (!this.securityConfig.enabled) return;
        
        const securityEntry = {
            event,
            timestamp: new Date().toISOString(),
            severity: details.severity || 'medium',
            source: details.source,
            target: details.target,
            action: details.action,
            result: details.result,
            metadata: details.metadata || {}
        };
        
        if (this.securityLogger) {
            this.securityLogger.warning('SECURITY', securityEntry);
        }
        
        // Alert if threshold met
        const level = this.getSecurityAlertLevel(details.severity);
        this.log(level, `Security: ${event}`, securityEntry);
    }
    
    performance(operation, duration, details = {}) {
        const perfEntry = {
            operation,
            duration,
            timestamp: new Date().toISOString(),
            slow: duration > this.performanceThresholds.slow,
            verySlow: duration > this.performanceThresholds.verySlow,
            metadata: details
        };
        
        if (this.performanceLogger) {
            this.performanceLogger.info('PERFORMANCE', perfEntry);
        }
        
        // Log slow operations
        if (perfEntry.verySlow) {
            this.warning(`Very slow operation: ${operation}`, perfEntry);
        } else if (perfEntry.slow) {
            this.info(`Slow operation: ${operation}`, perfEntry);
        }
        
        // Update metrics
        this.updatePerformanceMetrics(operation, duration);
    }
    
    request(req, res, responseTime) {
        const requestLog = {
            method: req.method,
            url: req.originalUrl || req.url,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            referer: req.headers.referer,
            statusCode: res.statusCode,
            responseTime,
            contentLength: res.get('content-length'),
            correlationId: this.getCorrelationId(req),
            user: req.user?.id,
            tenant: req.tenant?.id
        };
        
        // Determine log level based on status code
        let level = 'info';
        if (res.statusCode >= 500) {
            level = 'error';
        } else if (res.statusCode >= 400) {
            level = 'warning';
        }
        
        this.log(level, `${req.method} ${req.url} ${res.statusCode}`, requestLog);
        
        // Log performance if slow
        if (responseTime > this.performanceThresholds.slow) {
            this.performance(`${req.method} ${req.url}`, responseTime, requestLog);
        }
    }
    
    exception(error, context = {}) {
        const errorEntry = {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code,
            statusCode: error.statusCode,
            context,
            timestamp: new Date().toISOString()
        };
        
        // Group similar errors
        if (this.errorTracking.grouping) {
            errorEntry.fingerprint = this.generateErrorFingerprint(error);
        }
        
        this.error(`Exception: ${error.message}`, errorEntry);
        
        // Track error
        this.trackError(error, context);
    }

    /**
     * Request lifecycle logging
     */
    
    startRequest(req) {
        const correlationId = this.generateCorrelationId();
        this.setCorrelationId(req, correlationId);
        
        const startTime = process.hrtime.bigint();
        req._startTime = startTime;
        
        this.debug('Request started', {
            correlationId,
            method: req.method,
            url: req.url,
            headers: this.sanitizeHeaders(req.headers)
        });
        
        return correlationId;
    }
    
    endRequest(req, res) {
        if (!req._startTime) return;
        
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - req._startTime) / 1000000; // Convert to ms
        
        this.request(req, res, duration);
        
        // Clear correlation ID
        this.clearCorrelationId(req);
    }

    /**
     * Child logger creation
     */
    
    createChild(context = {}) {
        const childLogger = Object.create(this);
        childLogger.context = { ...this.context, ...context };
        
        return childLogger;
    }
    
    withContext(context = {}) {
        return this.createChild(context);
    }
    
    withCorrelationId(correlationId) {
        return this.createChild({ correlationId });
    }
    
    withUser(user) {
        return this.createChild({ userId: user.id, username: user.username });
    }
    
    withTenant(tenant) {
        return this.createChild({ tenantId: tenant.id, tenantName: tenant.name });
    }

    /**
     * Performance tracking
     */
    
    startTimer(label) {
        const startTime = process.hrtime.bigint();
        this.performanceMetrics.set(label, { startTime });
        
        return {
            end: () => this.endTimer(label),
            cancel: () => this.cancelTimer(label)
        };
    }
    
    endTimer(label) {
        const metric = this.performanceMetrics.get(label);
        
        if (!metric || !metric.startTime) {
            this.warning(`Timer not found: ${label}`);
            return null;
        }
        
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - metric.startTime) / 1000000; // Convert to ms
        
        this.performance(label, duration);
        this.performanceMetrics.delete(label);
        
        return duration;
    }
    
    cancelTimer(label) {
        this.performanceMetrics.delete(label);
    }

    /**
     * Utility methods
     */
    
    prepareLogEntry(level, message, meta) {
        const entry = {
            level,
            message,
            timestamp: new Date().toISOString(),
            service: this.serviceName,
            hostname: this.hostname,
            pid: this.pid
        };
        
        // Add context if present
        if (this.context) {
            entry.context = this.context;
        }
        
        // Add metadata
        if (meta && Object.keys(meta).length > 0) {
            entry.metadata = meta;
        }
        
        // Add correlation ID
        const correlationId = this.getCurrentCorrelationId();
        if (correlationId) {
            entry.correlationId = correlationId;
        }
        
        return entry;
    }
    
    shouldSample(level) {
        if (!this.samplingConfig.enabled) {
            return false;
        }
        
        // Always log certain levels
        if (this.samplingConfig.alwaysLog.includes(level)) {
            return false;
        }
        
        // Sample based on rate
        return Math.random() > this.samplingConfig.rate;
    }
    
    shouldBuffer(level) {
        // Don't buffer critical logs
        const criticalLevels = ['emergency', 'alert', 'critical', 'error'];
        if (criticalLevels.includes(level)) {
            return false;
        }
        
        // Buffer if buffer is not full
        return this.logBuffer.length < this.bufferSize;
    }
    
    bufferLog(entry) {
        this.logBuffer.push(entry);
        this.stats.buffered++;
        
        // Flush if buffer is full
        if (this.logBuffer.length >= this.bufferSize) {
            this.flushBuffer();
        }
    }
    
    writeLog(entry) {
        try {
            this.logger.log(entry);
        } catch (error) {
            this.stats.errors++;
            console.error('Logging error:', error);
        }
    }
    
    flushBuffer() {
        if (this.logBuffer.length === 0) return;
        
        const entries = this.logBuffer.splice(0);
        
        for (const entry of entries) {
            this.writeLog(entry);
        }
        
        this.stats.buffered = 0;
    }
    
    sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        const sensitive = ['authorization', 'cookie', 'x-api-key'];
        
        for (const header of sensitive) {
            if (sanitized[header]) {
                sanitized[header] = '***';
            }
        }
        
        return sanitized;
    }
    
    sanitizeAuditData(data) {
        const sanitized = { ...data };
        
        for (const field of this.auditConfig.sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '***';
            }
        }
        
        return sanitized;
    }
    
    generateCorrelationId() {
        return crypto.randomBytes(16).toString('hex');
    }
    
    setCorrelationId(req, correlationId) {
        req.correlationId = correlationId;
        this.correlationIds.set(req, correlationId);
    }
    
    getCorrelationId(req) {
        return req.correlationId || this.correlationIds.get(req);
    }
    
    clearCorrelationId(req) {
        this.correlationIds.delete(req);
    }
    
    getCurrentCorrelationId() {
        // Get from async context if available
        // This would use AsyncLocalStorage in production
        return null;
    }
    
    generateErrorFingerprint(error) {
        const parts = [
            error.name,
            error.message,
            error.code
        ];
        
        // Add stack trace location
        if (error.stack) {
            const stackLines = error.stack.split('\n');
            if (stackLines.length > 1) {
                parts.push(stackLines[1].trim());
            }
        }
        
        return crypto.createHash('md5')
            .update(parts.join(':'))
            .digest('hex');
    }
    
    getSecurityAlertLevel(severity) {
        const levelMap = {
            low: 'info',
            medium: 'warning',
            high: 'error',
            critical: 'critical'
        };
        
        return levelMap[severity] || 'warning';
    }
    
    updateStats(level) {
        this.stats.totalLogs++;
        this.stats.logsByLevel[level]++;
        
        if (level === 'error' || level === 'critical' || 
            level === 'alert' || level === 'emergency') {
            this.stats.errors++;
        }
    }
    
    updatePerformanceMetrics(operation, duration) {
        let metrics = this.performanceMetrics.get(operation);
        
        if (!metrics) {
            metrics = {
                count: 0,
                total: 0,
                min: Infinity,
                max: -Infinity,
                avg: 0
            };
        }
        
        metrics.count++;
        metrics.total += duration;
        metrics.min = Math.min(metrics.min, duration);
        metrics.max = Math.max(metrics.max, duration);
        metrics.avg = metrics.total / metrics.count;
        
        this.performanceMetrics.set(operation, metrics);
    }
    
    trackError(error, context) {
        if (!this.errorTracking.enabled) return;
        
        const errorKey = this.generateErrorFingerprint(error);
        let errorGroup = this.errorGroups?.get(errorKey);
        
        if (!errorGroup) {
            errorGroup = {
                fingerprint: errorKey,
                count: 0,
                firstSeen: new Date(),
                lastSeen: new Date(),
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                },
                contexts: []
            };
            
            if (!this.errorGroups) {
                this.errorGroups = new Map();
            }
            
            this.errorGroups.set(errorKey, errorGroup);
        }
        
        errorGroup.count++;
        errorGroup.lastSeen = new Date();
        errorGroup.contexts.push(context);
        
        // Keep only recent contexts
        if (errorGroup.contexts.length > 10) {
            errorGroup.contexts = errorGroup.contexts.slice(-10);
        }
    }
    
    ensureLogDirectory(dirname) {
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }
    }
    
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    /**
     * Background tasks
     */
    
    startBackgroundTasks() {
        // Flush buffer periodically
        this.flushIntervalTimer = setInterval(() => {
            this.flushBuffer();
        }, this.flushInterval);
        
        // Collect metrics periodically
        if (this.metricsConfig.enabled) {
            this.metricsIntervalTimer = setInterval(() => {
                this.logMetrics();
            }, this.metricsConfig.interval);
        }
        
        // Rotate performance metrics
        this.performanceRotationTimer = setInterval(() => {
            this.rotatePerformanceMetrics();
        }, 3600000); // Every hour
    }
    
    logMetrics() {
        const metrics = {
            stats: this.stats,
            performance: Object.fromEntries(this.performanceMetrics),
            errors: this.errorGroups ? this.errorGroups.size : 0,
            buffer: this.logBuffer.length
        };
        
        if (this.metricsConfig.includeSystemMetrics) {
            metrics.system = {
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                uptime: process.uptime()
            };
        }
        
        this.info('System metrics', metrics);
    }
    
    rotatePerformanceMetrics() {
        // Keep only recent metrics
        for (const [key, metrics] of this.performanceMetrics) {
            if (metrics.count === 0) {
                this.performanceMetrics.delete(key);
            } else {
                // Reset counters
                metrics.count = 0;
                metrics.total = 0;
            }
        }
    }

    /**
     * Cleanup handlers
     */
    
    setupCleanupHandlers() {
        process.on('exit', () => {
            this.shutdown();
        });
        
        process.on('SIGINT', () => {
            this.shutdown();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            this.shutdown();
            process.exit(0);
        });
        
        process.on('uncaughtException', (error) => {
            this.critical('Uncaught exception', {
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                }
            });
            
            this.shutdown();
            process.exit(1);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            this.critical('Unhandled rejection', {
                reason,
                promise: promise.toString()
            });
        });
    }
    
    shutdown() {
        this.info('Logger shutting down');
        
        // Flush any remaining logs
        this.flushBuffer();
        
        // Clear intervals
        if (this.flushIntervalTimer) {
            clearInterval(this.flushIntervalTimer);
        }
        
        if (this.metricsIntervalTimer) {
            clearInterval(this.metricsIntervalTimer);
        }
        
        if (this.performanceRotationTimer) {
            clearInterval(this.performanceRotationTimer);
        }
        
        // Close transports
        this.logger.close();
        
        if (this.auditLogger) {
            this.auditLogger.close();
        }
        
        if (this.securityLogger) {
            this.securityLogger.close();
        }
        
        if (this.performanceLogger) {
            this.performanceLogger.close();
        }
    }

    /**
     * Gets logger statistics
     * @returns {Object} Logger statistics
     */
    getStats() {
        return {
            ...this.stats,
            performance: Object.fromEntries(this.performanceMetrics),
            errors: this.errorGroups ? this.errorGroups.size : 0,
            bufferSize: this.logBuffer.length,
            uptime: process.uptime()
        };
    }
}

// Export singleton instance or class based on configuration
module.exports = { Logger };